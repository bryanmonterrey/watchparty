/**
 * Rebuild pre-existing wallets as fully seed-derived.
 *
 * Wallets created before seeded FROST got a random group key and a random swig
 * id, so their Solana address could never be restored from their phrase. This
 * regenerates both FROST and the swig id FROM THE EXISTING MNEMONIC, so the
 * user's 12 words are unchanged but now recover every chain including Solana.
 *
 *   bun run scripts/wallet/regenerate-seed-derived.ts --dry-run
 *   bun run scripts/wallet/regenerate-seed-derived.ts
 *
 * The mnemonic is NOT changed — only the key material derived from it.
 *
 * Cost: the old Swig account is abandoned along with its rent deposit
 * (0.00161472 SOL each, which the treasury paid). Only run this on wallets with
 * no spendable balance — check-existing-balances.ts reports that. A wallet
 * holding real funds needs a sweep first, which this script deliberately will
 * not do for you: it refuses any wallet whose balance exceeds its rent.
 *
 * The user's browser copy of the FROST client share goes stale, which is
 * survivable — frostSetup rehydrates it from frost_client_share_encrypted.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Connection, PublicKey } from "@solana/web3.js";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { user, walletAddresses } from "@/db/schema";
import { getSeedForUser } from "@/lib/wallet/seed";
import { deriveWalletKey } from "@/lib/wallet/key-derivation";
import { FROST_PATH, generateFrostKeypairFromSeed } from "@/lib/frost/frost-server";
import { computeSwigPdaFromSeed } from "@/lib/swig/swig-server";
import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";
import { redis } from "@/lib/cache";

const subtle = globalThis.crypto?.subtle;
if (!subtle) throw new Error("Web Crypto API not available");

const DRY_RUN = process.argv.includes("--dry-run");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const connection = new Connection(getRpcUrl(), "confirmed");

/** Lamports above rent — anything here is real money and must be swept first. */
async function spendableLamports(address: string | null): Promise<number> {
  if (!address) return 0;
  const info = await connection.getAccountInfo(new PublicKey(address));
  if (!info) return 0;
  const rent = await connection.getMinimumBalanceForRentExemption(info.data.length);
  return Math.max(0, info.lamports - rent);
}

async function main() {
  const { data: wallets, error } = await supabase.from("encrypted_wallets").select("*");
  if (error) throw new Error(`Fetch failed: ${error.message}`);

  const legacy = (wallets ?? []).filter((w) => w.frost_public_key);
  console.log(`\nregenerating seed-derived wallets${DRY_RUN ? " (dry run — no writes)" : ""}`);
  console.log(`  ${legacy.length} wallet(s)\n`);

  mkdirSync(".wallet-backups", { recursive: true });
  const backupPath = `.wallet-backups/pre-regenerate-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(legacy, null, 2));
  console.log(`  backup written: ${backupPath}\n`);

  for (const wallet of legacy) {
    const short = wallet.user_id.slice(0, 8);

    // Refuse to abandon an address holding more than its own rent.
    const spendable = await spendableLamports(wallet.swig_address);
    if (spendable > 0) {
      console.log(`  ⊘ ${short} SKIPPED — holds ${spendable / 1e9} SOL above rent; sweep it first`);
      continue;
    }

    const seed = await getSeedForUser(wallet.user_id);
    const frost = generateFrostKeypairFromSeed(seed);
    const swig = computeSwigPdaFromSeed(seed);

    if (swig.swigAddress === wallet.swig_address) {
      console.log(`  · ${short} already seed-derived, nothing to do`);
      continue;
    }

    const encKey = await deriveWalletKey(
      wallet.passkey_credential_id || `social-${wallet.user_id}`,
      Buffer.from(wallet.salt, "base64"),
      wallet.key_version ?? 1,
      ["encrypt"]
    );

    const serverIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedServerShare = await subtle!.encrypt(
      { name: "AES-GCM", iv: serverIv },
      encKey,
      Buffer.from(JSON.stringify(frost.serverShare))
    );

    const clientIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedClientShare = await subtle!.encrypt(
      { name: "AES-GCM", iv: clientIv },
      encKey,
      Buffer.from(JSON.stringify(frost.clientShare))
    );

    console.log(
      `  ${DRY_RUN ? "·" : "✓"} ${short} ${wallet.swig_address?.slice(0, 8)}… → ${swig.swigAddress.slice(0, 8)}…`
    );
    if (DRY_RUN) continue;

    const { error: walletError } = await supabase
      .from("encrypted_wallets")
      .update({
        frost_server_share: Buffer.from(encryptedServerShare).toString("base64"),
        frost_server_share_iv: Buffer.from(serverIv).toString("base64"),
        frost_client_share_encrypted: Buffer.from(encryptedClientShare).toString("base64"),
        frost_client_share_iv: Buffer.from(clientIv).toString("base64"),
        frost_public_key: frost.groupPublicKey,
        frost_public_info: JSON.stringify(frost.publicInfo),
        swig_id: swig.swigId,
        swig_address: swig.swigAddress,
        // The new PDA has no on-chain account yet; frostSetup creates it lazily.
        swig_account_created: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", wallet.user_id);
    if (walletError) throw new Error(`${short}: wallet update failed (${walletError.message})`);

    await db
      .update(user)
      .set({ wallet_address: swig.swigAddress, updatedAt: new Date() })
      .where(eq(user.id, wallet.user_id));

    // Only the solana row — without the chain_kind filter this would overwrite
    // the user's EVM, Bitcoin and Sui addresses with the Solana one.
    await db
      .update(walletAddresses)
      .set({ address: swig.swigAddress, derivation_path: FROST_PATH })
      .where(
        and(
          eq(walletAddresses.user_id, wallet.user_id),
          eq(walletAddresses.chain_kind, "solana")
        )
      );

    // customSession caches the profile for 5 minutes — drop the stale address.
    await redis.del(`user:profile:${wallet.user_id}`);
  }

  console.log(
    DRY_RUN
      ? "\n  dry run complete. No writes made.\n"
      : "\n  done. Phrases unchanged; Solana is now derivable from them.\n"
  );
}

main().catch((err) => {
  console.error("\nregeneration aborted:", err.message);
  process.exit(1);
});
