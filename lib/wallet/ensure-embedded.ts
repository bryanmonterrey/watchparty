// Provisioning a user's embedded (Swig) wallet.
//
// Extracted from app/api/create-wallet so it can also run for accounts that
// signed in with an extension wallet: those users get a Swig wallet too, it
// becomes their primary, and the extension wallet they arrived with is linked
// alongside it.
//
// Idempotent — if an encrypted_wallets row already exists this returns the
// existing Swig address and touches nothing.

import { nanoid } from "nanoid";
import { serviceClient } from "@/lib/supabase/service-client";
import { and, eq } from "drizzle-orm";
import * as bip39 from "bip39";
import { Keypair } from "@solana/web3.js";
import { db } from "@/db";
import { linkedWallets, user } from "@/db/schema";
import { generateFrostKeypairFromSeed } from "@/lib/frost/frost-server";
import { computeSwigPdaFromSeed } from "@/lib/swig/swig-server";
import { persistDerivedAddresses } from "@/lib/wallet/multichain";
import { redis } from "@/lib/cache";

const subtle = globalThis.crypto?.subtle;

// serviceClient(), not createClient(): this inserts `encrypted_wallets` — the
// exact path that once wrote a DEV user's wallet into PRODUCTION, where that
// user does not exist. It now refuses when drizzle and supabase-js target
// different projects outside production. See lib/supabase/service-client.ts.
function supabaseAdmin() {
  return serviceClient();
}

export interface EnsureEmbeddedResult {
  created: boolean;
  swigAddress: string;
  swigId: string;
  groupPublicKey: string;
  /** Only present when newly created — the user must be shown this to back up. */
  mnemonic?: string;
  clientShare?: unknown;
  publicInfo?: unknown;
  d2?: string;
  custodialAddress?: string;
}

/**
 * Ensure `userId` has an embedded Swig wallet, creating one if absent.
 *
 * `makePrimary` moves user.wallet_address to the Swig address and marks it
 * primary in linked_wallets. Any wallet the user previously had (e.g. the
 * extension they signed in with) is preserved as a non-primary linked row
 * rather than discarded.
 */
export async function ensureEmbeddedWallet(
  userId: string,
  options: { makePrimary?: boolean } = {}
): Promise<EnsureEmbeddedResult> {
  if (!subtle) throw new Error("Web Crypto API not available");
  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("encrypted_wallets")
    .select("swig_id, swig_address, frost_public_key")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.swig_address) {
    return {
      created: false,
      swigAddress: existing.swig_address,
      swigId: existing.swig_id,
      groupPublicKey: existing.frost_public_key,
    };
  }

  const encryptionKeySource = `social - ${userId} `;
  const mnemonic = bip39.generateMnemonic(128);
  const seed = new Uint8Array(await bip39.mnemonicToSeed(mnemonic));

  // Retained for backward compat with the Phase-3 server-signing path.
  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  const privateKeyBytes = keypair.secretKey;

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const masterKey = process.env.WALLET_MASTER_KEY ?? "";
  const baseKey = await subtle.importKey(
    "raw",
    Buffer.from(masterKey + encryptionKeySource, "utf-8") as any,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const encryptionKey = await subtle.deriveKey(
    { name: "PBKDF2", salt: Buffer.from(salt) as any, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedPrivkey = await subtle.encrypt(
    { name: "AES-GCM", iv: Buffer.from(iv) as any },
    encryptionKey,
    Buffer.from(privateKeyBytes) as any
  );

  // d1/d2 XOR split — d2 goes to the browser, d1 stays encrypted server-side.
  const d2 = crypto.getRandomValues(new Uint8Array(privateKeyBytes.length));
  const d1 = new Uint8Array(privateKeyBytes.length);
  for (let i = 0; i < privateKeyBytes.length; i++) d1[i] = privateKeyBytes[i] ^ d2[i];
  const d1Iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedD1 = await subtle.encrypt(
    { name: "AES-GCM", iv: Buffer.from(d1Iv) as any },
    encryptionKey,
    Buffer.from(d1) as any
  );

  const mnemonicIv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedMnemonic = await subtle.encrypt(
    { name: "AES-GCM", iv: Buffer.from(mnemonicIv) as any },
    encryptionKey,
    Buffer.from(mnemonic, "utf-8") as any
  );

  // FROST group key and swig id both derive from the seed, so the user's phrase
  // restores the Solana smart wallet as well as every other chain.
  const { serverShare, clientShare, publicInfo, groupPublicKey } =
    generateFrostKeypairFromSeed(seed);
  const swigInfo = computeSwigPdaFromSeed(seed);

  const shareIv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedShare = await subtle.encrypt(
    { name: "AES-GCM", iv: shareIv },
    encryptionKey,
    Buffer.from(JSON.stringify(serverShare))
  );
  const clientShareIv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedClientShare = await subtle.encrypt(
    { name: "AES-GCM", iv: clientShareIv },
    encryptionKey,
    Buffer.from(JSON.stringify(clientShare))
  );

  const { error: dbError } = await supabase.from("encrypted_wallets").insert({
    id: nanoid(),
    user_id: userId,
    address: keypair.publicKey.toBase58(),
    encrypted_privkey: Buffer.from(encryptedPrivkey).toString("base64"),
    encrypted_mnemonic: Buffer.from(encryptedMnemonic).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    mnemonic_iv: Buffer.from(mnemonicIv).toString("base64"),
    salt: Buffer.from(salt).toString("base64"),
    passkey_credential_id: encryptionKeySource,
    key_version: 2,
    encrypted_d1: Buffer.from(encryptedD1).toString("base64"),
    encrypted_d1_iv: Buffer.from(d1Iv).toString("base64"),
    frost_server_share: Buffer.from(encryptedShare).toString("base64"),
    frost_server_share_iv: Buffer.from(shareIv).toString("base64"),
    frost_client_share_encrypted: Buffer.from(encryptedClientShare).toString("base64"),
    frost_client_share_iv: Buffer.from(clientShareIv).toString("base64"),
    frost_public_key: groupPublicKey,
    frost_public_info: JSON.stringify(publicInfo),
    swig_id: swigInfo.swigId,
    swig_address: swigInfo.swigAddress,
    swig_account_created: false,
  });
  if (dbError) throw new Error(`Failed to store wallet: ${dbError.message}`);

  await persistDerivedAddresses(userId, seed, { solanaAddress: swigInfo.swigAddress });

  if (options.makePrimary !== false) {
    await makeWalletPrimary(userId, swigInfo.swigAddress, "swig");
  }

  await redis.del(`user:profile:${userId}`);

  return {
    created: true,
    swigAddress: swigInfo.swigAddress,
    swigId: swigInfo.swigId,
    groupPublicKey,
    mnemonic,
    clientShare,
    publicInfo,
    d2: Buffer.from(d2).toString("base64"),
    custodialAddress: keypair.publicKey.toBase58(),
  };
}

/**
 * Point user.wallet_address at `address` and mark it primary, demoting whatever
 * was primary before. The old primary is kept as a linked wallet — switching
 * which wallet is in front should never unlink one.
 */
export async function makeWalletPrimary(
  userId: string,
  address: string,
  source: "swig" | "extension",
  label?: string
): Promise<void> {
  // Preserve the OUTGOING wallet before anything overwrites it.
  //
  // This function's own docs promise that "any wallet the user previously had
  // (e.g. the extension they signed in with) is preserved as a non-primary
  // linked row rather than discarded" — but nothing implemented it. A user who
  // signed in with an extension had user.wallet_address set to that extension
  // and, if it predated linked_wallets, no row anywhere. Creating the embedded
  // wallet then called this with the Swig address, the update at the bottom
  // overwrote wallet_address, and the extension address was simply GONE: not
  // primary, not linked, not recorded. The app could no longer name the wallet
  // the account was opened with, which is also why its balance can't be shown
  // without reconnecting the extension by hand.
  const [current] = await db
    .select({ walletAddress: user.wallet_address })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const outgoing = current?.walletAddress;
  if (outgoing && outgoing !== address) {
    const [alreadyLinked] = await db
      .select({ id: linkedWallets.id })
      .from(linkedWallets)
      .where(and(eq(linkedWallets.user_id, userId), eq(linkedWallets.address, outgoing)))
      .limit(1);

    if (!alreadyLinked) {
      // It's being displaced by this call, so it isn't the wallet we're
      // promoting; anything the user arrived with is an external wallet.
      await db.insert(linkedWallets).values({
        id: nanoid(),
        user_id: userId,
        address: outgoing,
        source: "extension",
        is_primary: false,
      });
    }
  }

  // Clear the old primary first: a partial unique index allows only one per
  // user, so promoting before demoting would collide.
  await db
    .update(linkedWallets)
    .set({ is_primary: false })
    .where(and(eq(linkedWallets.user_id, userId), eq(linkedWallets.is_primary, true)));

  const [existing] = await db
    .select({ id: linkedWallets.id })
    .from(linkedWallets)
    .where(and(eq(linkedWallets.user_id, userId), eq(linkedWallets.address, address)))
    .limit(1);

  if (existing) {
    await db
      .update(linkedWallets)
      .set({ is_primary: true })
      .where(eq(linkedWallets.id, existing.id));
  } else {
    await db.insert(linkedWallets).values({
      id: nanoid(),
      user_id: userId,
      address,
      source,
      label,
      is_primary: true,
    });
  }

  await db
    .update(user)
    .set({ wallet_address: address, updatedAt: new Date() })
    .where(eq(user.id, userId));

  await redis.del(`user:profile:${userId}`);
}
