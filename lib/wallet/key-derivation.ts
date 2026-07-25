// The wallet AES key derivation used by the LIVE encrypted_wallets rows.
//
// One source of truth on purpose. The parameters here (100k PBKDF2 iterations,
// master key prepended for key_version >= 2) must match app/api/create-wallet
// exactly — the revealPhrase route once derived without the master key and
// silently failed to decrypt every v2 wallet. Anything that opens a wallet
// should call this rather than re-implementing it.
//
// Note: lib/solana/wallet-encryption.ts uses a DIFFERENT scheme (600k
// iterations) and is not interchangeable with this one.

const subtle = globalThis.crypto?.subtle;

export async function deriveWalletKey(
  credentialId: string,
  salt: Buffer,
  keyVersion: number,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  if (!subtle) throw new Error("Web Crypto API not available");

  const masterKey = keyVersion >= 2 ? (process.env.WALLET_MASTER_KEY ?? "") : "";
  const keyMaterial = masterKey + credentialId;

  const baseKey = await subtle.importKey(
    "raw",
    Buffer.from(keyMaterial, "utf-8") as any,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    { name: "PBKDF2", salt: salt as any, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    usage
  );
}
