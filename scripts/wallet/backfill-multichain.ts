/**
 * Backfill multichain addresses for wallets created before seeded derivation.
 *
 *   bun run scripts/wallet/backfill-multichain.ts --dry-run      # report only
 *   bun run scripts/wallet/backfill-multichain.ts --limit 25     # small batch
 *   bun run scripts/wallet/backfill-multichain.ts                # full run
 *
 * This runs against the shared (dev == prod) Supabase DB, so it is deliberately
 * conservative: it only ever INSERTs into wallet_addresses, never touches
 * encrypted_wallets or user, and is idempotent — a user who already has all
 * four address kinds is skipped, so an interrupted run just resumes.
 *
 * What existing users do and don't get:
 *   ✓ EVM, Bitcoin and Sui addresses, genuinely derived from their phrase.
 *   ✗ A phrase-recoverable Solana address. Their FROST group key and swig id
 *     were generated randomly and only exist in the DB, so their Solana row
 *     records the EXISTING swig address with path `legacy-random`. Migrating
 *     them would mean moving funds to a new address — not something a backfill
 *     script should decide.
 */

import { db } from "@/db";
import { encrypted_wallets } from "@/db/schema";
import { seedFromMnemonic } from "@/lib/chains/derive";
import {
  LEGACY_SOLANA_PATH,
  buildAddressRows,
  persistDerivedAddresses,
} from "@/lib/wallet/multichain";
import { CHAIN_KINDS } from "@/lib/chains/registry";
import { walletAddresses } from "@/db/schema";
import { eq } from "drizzle-orm";

const subtle = globalThis.crypto?.subtle;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitFlag = args.indexOf("--limit");
const LIMIT = limitFlag !== -1 ? Number.parseInt(args[limitFlag + 1], 10) : undefined;

interface WalletRow {
  user_id: string;
  salt: string;
  encrypted_mnemonic: string | null;
  mnemonic_iv: string | null;
  passkey_credential_id: string;
  swig_address: string | null;
}

/**
 * Rebuild the AES-GCM key that encrypted this wallet.
 *
 * v2 wallets derive from `WALLET_MASTER_KEY + keySource`; v1 wallets from
 * `keySource` alone. Rows of both vintages can coexist, so try both rather than
 * trusting key_version.
 */
async function candidateKeys(row: WalletRow): Promise<{ scheme: string; key: CryptoKey }[]> {
  const keySource = row.passkey_credential_id;
  const masterKey = process.env.WALLET_MASTER_KEY ?? "";
  const salt = Buffer.from(row.salt, "base64");

  const materials = masterKey
    ? [
        { scheme: "master+source", material: masterKey + keySource },
        { scheme: "source-only", material: keySource },
      ]
    : [{ scheme: "source-only", material: keySource }];
  const keys: { scheme: string; key: CryptoKey }[] = [];

  for (const { scheme, material } of materials) {
    const baseKey = await subtle!.importKey(
      "raw",
      Buffer.from(material, "utf-8") as any,
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    keys.push({
      scheme,
      key: await subtle!.deriveKey(
        { name: "PBKDF2", salt: salt as any, iterations: 100000, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      ),
    });
  }
  return keys;
}

async function decryptMnemonic(
  row: WalletRow
): Promise<{ mnemonic: string; scheme: string } | null> {
  if (!row.encrypted_mnemonic || !row.mnemonic_iv) return null;

  const iv = Buffer.from(row.mnemonic_iv, "base64");
  const payload = Buffer.from(row.encrypted_mnemonic, "base64");

  for (const { scheme, key } of await candidateKeys(row)) {
    try {
      const plain = await subtle!.decrypt({ name: "AES-GCM", iv: iv as any }, key, payload as any);
      return { mnemonic: Buffer.from(plain).toString("utf-8"), scheme };
    } catch {
      // Wrong key scheme — try the next candidate.
    }
  }
  return null;
}

async function main() {
  if (!subtle) throw new Error("Web Crypto API not available");

  console.log(`\nmultichain backfill${DRY_RUN ? " (dry run — no writes)" : ""}`);

  const wallets = (await db
    .select({
      user_id: encrypted_wallets.user_id,
      salt: encrypted_wallets.salt,
      encrypted_mnemonic: encrypted_wallets.encrypted_mnemonic,
      mnemonic_iv: encrypted_wallets.mnemonic_iv,
      passkey_credential_id: encrypted_wallets.passkey_credential_id,
      swig_address: encrypted_wallets.swig_address,
    })
    .from(encrypted_wallets)) as WalletRow[];

  const targets = LIMIT ? wallets.slice(0, LIMIT) : wallets;
  console.log(`  ${wallets.length} wallets total${LIMIT ? `, processing ${targets.length}` : ""}\n`);

  const stats = { done: 0, skipped: 0, noMnemonic: 0, undecryptable: 0, failed: 0 };
  // Which key scheme actually opened the mnemonics — tells us whether the
  // reveal-phrase route (which omits WALLET_MASTER_KEY) can decrypt these.
  const schemesSeen = new Set<string>();

  for (const row of targets) {
    const short = row.user_id.slice(0, 8);

    // Idempotent: already has the full set.
    const existing = await db
      .select({ kind: walletAddresses.chain_kind })
      .from(walletAddresses)
      .where(eq(walletAddresses.user_id, row.user_id));
    if (existing.length >= CHAIN_KINDS.length) {
      stats.skipped++;
      continue;
    }

    if (!row.encrypted_mnemonic || !row.mnemonic_iv) {
      console.log(`  ⊘ ${short}  no stored mnemonic (pre-mnemonic wallet)`);
      stats.noMnemonic++;
      continue;
    }

    try {
      const decrypted = await decryptMnemonic(row);
      if (!decrypted) {
        console.log(`  ✗ ${short}  mnemonic did not decrypt under either key scheme`);
        stats.undecryptable++;
        continue;
      }
      schemesSeen.add(decrypted.scheme);

      const seed = seedFromMnemonic(decrypted.mnemonic);
      const options = {
        solanaAddress: row.swig_address ?? undefined,
        solanaDerivationPath: row.swig_address ? LEGACY_SOLANA_PATH : undefined,
      };

      if (DRY_RUN) {
        const rows = buildAddressRows(seed, options);
        console.log(`  · ${short}  ${rows.map((r) => `${r.kind}=${r.address.slice(0, 10)}…`).join("  ")}`);
      } else {
        await persistDerivedAddresses(row.user_id, seed, options);
        console.log(`  ✓ ${short}`);
      }
      stats.done++;
    } catch (err: any) {
      console.log(`  ✗ ${short}  ${err?.message ?? err}`);
      stats.failed++;
    }
  }

  console.log(
    `\n  ${DRY_RUN ? "would backfill" : "backfilled"} ${stats.done}` +
      `  ·  skipped ${stats.skipped}` +
      `  ·  no mnemonic ${stats.noMnemonic}` +
      `  ·  undecryptable ${stats.undecryptable}` +
      `  ·  failed ${stats.failed}\n`
  );

  if (schemesSeen.size > 0) {
    console.log(`  key scheme(s) that decrypted: ${[...schemesSeen].join(", ")}`);
    if (schemesSeen.has("source-only")) {
      console.log(
        "  ⚠ v1 rows (no WALLET_MASTER_KEY) still exist — deriveWalletKey treats these\n" +
          "    as key_version 1. Confirm key_version matches before rotating the master key.\n"
      );
    }
  }

  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("backfill aborted:", err);
  process.exit(1);
});
