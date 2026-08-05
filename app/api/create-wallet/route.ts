// app/api/create-wallet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "../../../lib/auth/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { headers } from "next/headers";
import { db } from "../../../db";
import { user } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { Keypair } from "@solana/web3.js";
import { nanoid } from "nanoid";
import { createClient } from "@supabase/supabase-js";
import * as bip39 from "bip39";
import { generateFrostKeypairFromSeed } from "@/lib/frost/frost-server";
import { computeSwigPdaFromSeed, createSwigAccount } from "@/lib/swig/swig-server";
import { persistDerivedAddresses } from "@/lib/wallet/multichain";
import { registerWebhookAddresses } from "@/lib/helius/webhook";
import { registerAlchemyAddresses } from "@/lib/alchemy/webhook";
import { redis } from "@/lib/cache";

// Use browser's Web Crypto API (works in Node.js 16+)
const subtle = globalThis.crypto?.subtle;

interface EncryptedWallet {
  address: string;
  encrypted_privkey: string;
  encrypted_mnemonic: string;
  iv: string;
  mnemonic_iv: string;
  salt: string;
  mnemonic: string;
  // Phase 3: d1 share stored server-side, d2 returned to client for IndexedDB
  encrypted_d1: string;
  encrypted_d1_iv: string;
  d2: string; // base64 raw d2 — client encrypts with PRF before storing
  /** BIP39 seed — root of every chain address. Never leaves the server. */
  seed: Uint8Array;
}

async function generateEncryptedWallet(
  userId: string,
  encryptionKeySource: string
): Promise<EncryptedWallet> {
  if (!subtle) {
    throw new Error("Web Crypto API not available");
  }

  // 1. Generate BIP39 mnemonic (12 words)
  const mnemonic = bip39.generateMnemonic(128); // 128 bits = 12 words

  // 2. Derive seed from mnemonic
  const seed = await bip39.mnemonicToSeed(mnemonic);

  // 3. Generate Solana keypair from seed (using first 32 bytes)
  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  const address = keypair.publicKey.toBase58();
  const privateKeyBytes = keypair.secretKey;

  console.log(`🔑 Generated wallet from mnemonic: ${address.slice(0, 8)}...`);

  // 4. Derive encryption key — master key is prepended so DB breach alone is useless
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const masterKey = process.env.WALLET_MASTER_KEY ?? "";
  const keyMaterial = masterKey + encryptionKeySource;

  const keyBuffer = Buffer.from(keyMaterial, 'utf-8');

  const baseKey = await subtle.importKey(
    "raw",
    keyBuffer as any,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const encryptionKey = await subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: Buffer.from(salt) as any,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );

  // 5. Encrypt full private key (retained for Phase 3 backward compat with server signing)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await subtle.encrypt(
    { name: "AES-GCM", iv: Buffer.from(iv) as any },
    encryptionKey,
    Buffer.from(privateKeyBytes) as any
  );

  // 6. Split key into d1/d2 and encrypt d1 (Phase 3 key split)
  const d2 = crypto.getRandomValues(new Uint8Array(privateKeyBytes.length));
  const d1 = new Uint8Array(privateKeyBytes.length);
  for (let i = 0; i < privateKeyBytes.length; i++) {
    d1[i] = privateKeyBytes[i] ^ d2[i];
  }
  const d1Iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedD1 = await subtle.encrypt(
    { name: "AES-GCM", iv: Buffer.from(d1Iv) as any },
    encryptionKey,
    Buffer.from(d1) as any
  );

  // 7. Encrypt mnemonic
  const mnemonicIv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedMnemonic = await subtle.encrypt(
    { name: "AES-GCM", iv: Buffer.from(mnemonicIv) as any },
    encryptionKey,
    Buffer.from(mnemonic, 'utf-8') as any
  );

  return {
    address,
    encrypted_privkey: Buffer.from(encrypted).toString("base64"),
    encrypted_mnemonic: Buffer.from(encryptedMnemonic).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    mnemonic_iv: Buffer.from(mnemonicIv).toString("base64"),
    salt: Buffer.from(salt).toString("base64"),
    mnemonic,
    encrypted_d1: Buffer.from(encryptedD1).toString("base64"),
    encrypted_d1_iv: Buffer.from(d1Iv).toString("base64"),
    d2: Buffer.from(d2).toString("base64"),
    seed: new Uint8Array(seed),
  };
}

export async function POST(req: NextRequest) {
  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Check if user already has a wallet
    if (session.user.wallet_address) {
      return NextResponse.json(
        { error: "User already has a wallet" },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

    // Turnstile, before any key generation or writes.
    //
    // The session check above says the caller is signed in and the IP limit
    // below says they haven't asked 100 times today; neither says a person
    // asked. This endpoint mints a keypair, writes an encrypted row, and puts
    // an account on-chain the treasury pays rent for — so it's worth the extra
    // round trip. Token comes from the widget on the create button.
    const turnstileToken = await req
        .clone()
        .json()
        .then((b: { turnstileToken?: string }) => b?.turnstileToken)
        .catch(() => undefined);

    const captcha = await verifyTurnstile(turnstileToken, ip);
    if (!captcha.ok) {
        console.warn("[create-wallet] turnstile rejected", { userId, reason: captcha.reason });
        return NextResponse.json(
            { error: "Couldn't verify that you're human. Please try again." },
            { status: 403 },
        );
    }

    // IP rate limit — relaxed to 100/day during testing (tighten before launch)
    const ipKey = `ratelimit:create-wallet:${ip}`;
    try {
      const count = await redis.incr(ipKey);
      if (count === 1) await redis.expire(ipKey, 86400);
      if (count > 100) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    } catch { /* Redis unavailable — fail open */ }

    // Generate encryption key source from social login
    const encryptionKeySource = `social - ${userId} `;

    // Generate encrypted custodial wallet (backup signing key)
    const encryptedWallet = await generateEncryptedWallet(userId, encryptionKeySource);

    // FROST keypair + Swig id, both derived from the mnemonic seed — pure key
    // generation, no RPC, free. Seeding them (rather than using randomness) is
    // what puts the Solana smart wallet under the same phrase as every other
    // chain, so one backup restores the whole multichain account.
    const { serverShare, clientShare, publicInfo, groupPublicKey } =
      generateFrostKeypairFromSeed(encryptedWallet.seed);

    // Compute Swig PDA deterministically — no RPC needed.
    // The on-chain account is created lazily by frostSetup on first signing attempt.
    const swigInfo = computeSwigPdaFromSeed(encryptedWallet.seed);

    // Encrypt FROST server share with the same AES-GCM key used for the wallet
    const salt = Buffer.from(encryptedWallet.salt, "base64");
    const masterKey = process.env.WALLET_MASTER_KEY ?? "";
    const keyMaterial = masterKey + encryptionKeySource;
    const baseKey = await subtle!.importKey(
      "raw", Buffer.from(keyMaterial, "utf-8") as any, "PBKDF2", false, ["deriveKey"]
    );
    const encKey = await subtle!.deriveKey(
      { name: "PBKDF2", salt: Buffer.from(salt) as any, iterations: 100000, hash: "SHA-256" },
      baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
    );
    const shareIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedShare = await subtle!.encrypt(
      { name: "AES-GCM", iv: shareIv },
      encKey,
      Buffer.from(JSON.stringify(serverShare))
    );

    // Encrypt client share with the same key — server backup lets frostSetup
    // recover it if the user's IndexedDB is cleared or they switch devices.
    const clientShareIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedClientShare = await subtle!.encrypt(
      { name: "AES-GCM", iv: clientShareIv },
      encKey,
      Buffer.from(JSON.stringify(clientShare))
    );

    // Store in Supabase using service role key (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error: dbError } = await supabase.from('encrypted_wallets').insert({
      id: nanoid(),
      user_id: userId,
      address: encryptedWallet.address,         // custodial keypair address (backup)
      encrypted_privkey: encryptedWallet.encrypted_privkey,
      encrypted_mnemonic: encryptedWallet.encrypted_mnemonic,
      iv: encryptedWallet.iv,
      mnemonic_iv: encryptedWallet.mnemonic_iv,
      salt: encryptedWallet.salt,
      passkey_credential_id: encryptionKeySource,
      key_version: 2,
      encrypted_d1: encryptedWallet.encrypted_d1,
      encrypted_d1_iv: encryptedWallet.encrypted_d1_iv,
      // FROST — server share encrypted, client share returned to browser
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

    if (dbError) {
      console.error('❌ Supabase error:', dbError);
      throw new Error(`Failed to store wallet: ${dbError.message}`);
    }

    // wallet_address = Swig PDA — the user's permanent public address
    await db
      .update(user)
      .set({
        wallet_address: swigInfo.swigAddress,
        updatedAt: new Date()
      })
      .where(eq(user.id, userId));

    // Derive + store the rest of the multichain set (EVM, Bitcoin, Sui) from the
    // same seed. Solana is stored as the Swig PDA, since that's the address the
    // user actually holds funds at.
    const derivedAddresses = await persistDerivedAddresses(userId, encryptedWallet.seed, {
      solanaAddress: swigInfo.swigAddress,
    });

    // Bust the customSession Redis cache so getSession() immediately returns
    // the new wallet_address instead of the stale cached profile (TTL = 5 min).
    await redis.del(`user:profile:${userId}`);

    console.log(`✅ Wallet created for user ${userId.slice(0, 8)}: swigPDA=${swigInfo.swigAddress.slice(0, 8)}... custodial=${encryptedWallet.address.slice(0, 8)}...`);

    // Create the Swig account on-chain AFTER the response is sent so the user
    // isn't blocked waiting for blockchain confirmation (~2 seconds). The account
    // will be ready long before the user finishes acknowledging their seed phrase.
    after(async () => {
      try {
        await createSwigAccount(swigInfo.swigId, groupPublicKey);
        await supabase.from("encrypted_wallets")
          .update({ swig_account_created: true, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        console.log(`[create-wallet] Swig account confirmed on-chain for ${userId.slice(0, 8)}`);
      } catch (err: any) {
        if (!err?.message?.includes("already in use")) {
          console.error("[create-wallet] background Swig creation failed:", err?.message);
        }
      }
      // Register addresses with Helius after Swig account exists
      registerWebhookAddresses([swigInfo.swigAddress, encryptedWallet.address]).catch(err =>
        console.warn("[create-wallet] webhook registration failed (non-fatal):", err?.message)
      );

      // Same for EVM — one address covers all five EVM chains. Non-fatal:
      // without it the wallet polls instead of updating on push.
      const evmAddress = derivedAddresses.find(a => a.kind === "evm")?.address;
      if (evmAddress) {
        registerAlchemyAddresses([evmAddress]).catch(err =>
          console.warn("[create-wallet] alchemy webhook registration failed (non-fatal):", err?.message)
        );
      }
    });

    return NextResponse.json({
      success: true,
      address: swigInfo.swigAddress,             // Swig PDA = user's public address
      custodialAddress: encryptedWallet.address,
      mnemonic: encryptedWallet.mnemonic,
      d2: encryptedWallet.d2,
      clientShare,
      publicInfo,
      addresses: derivedAddresses.map(({ kind, address }) => ({ kind, address })),
    });
  } catch (error) {
    console.error("❌ Failed to create wallet:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
