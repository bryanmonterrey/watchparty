/**
 * Rotate WALLET_MASTER_KEY.
 *
 * The master key is PBKDF2 input for every v2 wallet's AES key, so it cannot be
 * swapped in isolation: changing the env var alone makes every existing wallet
 * permanently undecryptable. Rotation means decrypting each field with the OLD
 * key and re-encrypting with the NEW one, in one pass.
 *
 *   WALLET_MASTER_KEY_NEW="$(openssl rand -base64 32)" \
 *     bun run scripts/wallet/rotate-master-key.ts --dry-run
 *   ... then re-run without --dry-run, then put the new value in .env*
 *
 * Fields rotated (all encrypted server-side under the master key):
 *   encrypted_privkey, encrypted_mnemonic, encrypted_d1,
 *   frost_server_share, frost_client_share_encrypted
 *
 * NOT rotated: encrypted_d2_backup. That ciphertext is produced in the browser
 * under the user's passkey PRF (storeD2Backup only stores what it is handed) —
 * the server has no key for it, and re-encrypting it would destroy it.
 *
 * Safety: every wallet is verified to round-trip under the new key BEFORE
 * anything is written, and the untouched originals are dumped to
 * .wallet-backups/ first. A failure aborts the whole run.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { deriveWalletKey } from "@/lib/wallet/key-derivation";

const subtle = globalThis.crypto?.subtle;
if (!subtle) throw new Error("Web Crypto API not available");

const DRY_RUN = process.argv.includes("--dry-run");

const OLD_KEY = process.env.WALLET_MASTER_KEY ?? "";
const NEW_KEY = process.env.WALLET_MASTER_KEY_NEW ?? "";

if (!OLD_KEY) throw new Error("WALLET_MASTER_KEY (current) is not set");
if (!NEW_KEY) throw new Error("WALLET_MASTER_KEY_NEW is not set");
if (OLD_KEY === NEW_KEY) throw new Error("New key is identical to the old one");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** ciphertext column → iv column */
const FIELDS: [string, string][] = [
  ["encrypted_privkey", "iv"],
  ["encrypted_mnemonic", "mnemonic_iv"],
  ["encrypted_d1", "encrypted_d1_iv"],
  ["frost_server_share", "frost_server_share_iv"],
  ["frost_client_share_encrypted", "frost_client_share_iv"],
];

/**
 * deriveWalletKey reads the master key from the environment, so swap it around
 * each call. Single-threaded script — no interleaving to worry about.
 */
async function keyWith(
  master: string,
  credentialId: string,
  salt: Buffer,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const previous = process.env.WALLET_MASTER_KEY;
  process.env.WALLET_MASTER_KEY = master;
  try {
    return await deriveWalletKey(credentialId, salt, 2, usage);
  } finally {
    process.env.WALLET_MASTER_KEY = previous;
  }
}

async function main() {
  const { data: wallets, error } = await supabase
    .from("encrypted_wallets")
    .select("*");
  if (error) throw new Error(`Fetch failed: ${error.message}`);
  if (!wallets?.length) {
    console.log("No wallets to rotate.");
    return;
  }

  console.log(`\nrotating WALLET_MASTER_KEY${DRY_RUN ? " (dry run — no writes)" : ""}`);
  console.log(`  ${wallets.length} wallet(s)\n`);

  // Untouched originals, before anything is computed.
  mkdirSync(".wallet-backups", { recursive: true });
  const backupPath = `.wallet-backups/encrypted_wallets-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(wallets, null, 2));
  console.log(`  backup written: ${backupPath}\n`);

  const updates: { user_id: string; patch: Record<string, string> }[] = [];

  for (const wallet of wallets) {
    const short = wallet.user_id.slice(0, 8);
    const credentialId = wallet.passkey_credential_id || `social-${wallet.user_id}`;
    const salt = Buffer.from(wallet.salt, "base64");

    if ((wallet.key_version ?? 1) < 2) {
      throw new Error(`${short}: key_version ${wallet.key_version} predates the master key`);
    }

    const oldKey = await keyWith(OLD_KEY, credentialId, salt, ["decrypt"]);
    const newEncKey = await keyWith(NEW_KEY, credentialId, salt, ["encrypt"]);
    const newDecKey = await keyWith(NEW_KEY, credentialId, salt, ["decrypt"]);

    const patch: Record<string, string> = {};
    const rotated: string[] = [];

    for (const [field, ivField] of FIELDS) {
      const ciphertext = wallet[field];
      const iv = wallet[ivField];
      if (!ciphertext || !iv) continue;

      const plain = await subtle!.decrypt(
        { name: "AES-GCM", iv: Buffer.from(iv, "base64") as any },
        oldKey,
        Buffer.from(ciphertext, "base64") as any
      );

      const newIv = crypto.getRandomValues(new Uint8Array(12));
      const reencrypted = await subtle!.encrypt(
        { name: "AES-GCM", iv: newIv },
        newEncKey,
        plain
      );

      // Prove it opens under the new key before we agree to write it.
      const check = await subtle!.decrypt(
        { name: "AES-GCM", iv: newIv },
        newDecKey,
        reencrypted
      );
      if (Buffer.from(check).toString("base64") !== Buffer.from(plain).toString("base64")) {
        throw new Error(`${short}: ${field} failed round-trip verification`);
      }

      patch[field] = Buffer.from(reencrypted).toString("base64");
      patch[ivField] = Buffer.from(newIv).toString("base64");
      rotated.push(field);
    }

    if (wallet.encrypted_d2_backup) {
      console.log(`  · ${short} has a client-side d2 backup — left untouched (passkey PRF)`);
    }

    updates.push({ user_id: wallet.user_id, patch });
    console.log(`  ✓ ${short} ${rotated.length} field(s) verified: ${rotated.join(", ")}`);
  }

  if (DRY_RUN) {
    console.log(`\n  would update ${updates.length} wallet(s). No writes made.\n`);
    return;
  }

  // Every wallet verified above — only now do we write.
  for (const { user_id, patch } of updates) {
    const { error: updateError } = await supabase
      .from("encrypted_wallets")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", user_id);
    if (updateError) {
      throw new Error(
        `${user_id.slice(0, 8)}: write failed (${updateError.message}). ` +
          `Restore from ${backupPath} before retrying.`
      );
    }
  }

  console.log(`\n  rotated ${updates.length} wallet(s).`);
  console.log("  Now set WALLET_MASTER_KEY to the new value in .env, .env.local,");
  console.log("  .env.production and the DOTENV_PRODUCTION deploy secret.\n");
}

main().catch((err) => {
  console.error("\nrotation aborted:", err.message);
  console.error("No partial state should exist — writes only happen after all wallets verify.\n");
  process.exit(1);
});
