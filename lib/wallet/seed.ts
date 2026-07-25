// Server-side access to a user's BIP39 seed, for signing on the chains FROST
// cannot cover.
//
// Why this exists: FROST is ed25519-only. It signs Solana through the 2-of-2
// Swig setup, but it cannot produce a secp256k1 signature, so EVM and Bitcoin
// transactions have to be signed from the mnemonic-derived keys. That is a
// weaker trust model than Solana's — the server can reconstruct those keys —
// and it is inherent to supporting those chains with an embedded wallet.
//
// Consequences, deliberately: never expose this over an endpoint that returns
// key material, never log the seed or mnemonic, and hold it no longer than a
// single signing call.

import { createClient } from "@supabase/supabase-js";
import { deriveWalletKey } from "./key-derivation";
import { seedFromMnemonic } from "@/lib/chains/derive";

const subtle = globalThis.crypto?.subtle;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Decrypt the user's mnemonic and return the BIP39 seed.
 * Throws when the wallet predates mnemonic storage — those wallets can only
 * sign on Solana.
 */
export async function getSeedForUser(userId: string): Promise<Uint8Array> {
  if (!subtle) throw new Error("Web Crypto API not available");

  const { data, error } = await supabase
    .from("encrypted_wallets")
    .select("salt, encrypted_mnemonic, mnemonic_iv, passkey_credential_id, key_version")
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error("Wallet not found");
  if (!data.encrypted_mnemonic || !data.mnemonic_iv) {
    throw new Error(
      "This wallet predates recovery-phrase storage and can only transact on Solana"
    );
  }

  const key = await deriveWalletKey(
    data.passkey_credential_id || `social-${userId}`,
    Buffer.from(data.salt, "base64"),
    data.key_version ?? 1,
    ["decrypt"]
  );

  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(data.mnemonic_iv, "base64") as any },
    key,
    Buffer.from(data.encrypted_mnemonic, "base64") as any
  );

  return seedFromMnemonic(Buffer.from(plain).toString("utf-8"));
}
