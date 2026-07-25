/**
 * Proves WALLET_MASTER_KEY rotation left every wallet usable.
 *
 * Decrypts each mnemonic with the CURRENT env key, re-derives every chain
 * address, and compares against what is stored in wallet_addresses. If the
 * rotation had corrupted a field, the decrypt would throw or the addresses
 * would diverge.
 *
 *   bun run scripts/wallet/verify-rotation.ts
 */

import { db } from "@/db";
import { walletAddresses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { getSeedForUser } from "@/lib/wallet/seed";
import { buildAddressRows } from "@/lib/wallet/multichain";
import { deriveWalletKey } from "@/lib/wallet/key-derivation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

let failures = 0;

const { data: wallets } = await supabase
  .from("encrypted_wallets")
  .select("user_id, salt, passkey_credential_id, key_version, encrypted_privkey, iv, frost_server_share, frost_server_share_iv, swig_address");

for (const wallet of wallets ?? []) {
  const short = wallet.user_id.slice(0, 8);
  try {
    // 1. Mnemonic decrypts and re-derives the stored addresses.
    const seed = await getSeedForUser(wallet.user_id);
    const derived = buildAddressRows(seed, { solanaAddress: wallet.swig_address ?? undefined });

    const stored = await db
      .select({ kind: walletAddresses.chain_kind, address: walletAddresses.address })
      .from(walletAddresses)
      .where(eq(walletAddresses.user_id, wallet.user_id));
    const storedByKind = Object.fromEntries(stored.map((r) => [r.kind, r.address]));

    const mismatches = derived.filter((d) => storedByKind[d.kind] !== d.address);

    // 2. The other rotated fields still open under the same key.
    const key = await deriveWalletKey(
      wallet.passkey_credential_id || `social-${wallet.user_id}`,
      Buffer.from(wallet.salt, "base64"),
      wallet.key_version ?? 1,
      ["decrypt"]
    );
    const others: string[] = [];
    for (const [field, ivField] of [
      ["encrypted_privkey", "iv"],
      ["frost_server_share", "frost_server_share_iv"],
    ] as const) {
      if (!wallet[field] || !wallet[ivField]) continue;
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: Buffer.from(wallet[ivField] as string, "base64") as any },
        key,
        Buffer.from(wallet[field] as string, "base64") as any
      );
      others.push(field);
    }

    if (mismatches.length > 0) {
      failures++;
      console.log(`✗ ${short} address mismatch: ${mismatches.map((m) => m.kind).join(", ")}`);
    } else {
      console.log(`✓ ${short} mnemonic decrypts, ${derived.length} addresses match, ${others.length} other field(s) open`);
    }
  } catch (err: any) {
    failures++;
    console.log(`✗ ${short} ${err?.message ?? err}`);
  }
}

console.log(
  failures === 0
    ? "\nrotation verified — every wallet decrypts and derives identically\n"
    : `\n${failures} wallet(s) FAILED — restore from .wallet-backups/\n`
);
process.exit(failures === 0 ? 0 : 1);
