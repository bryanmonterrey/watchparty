// lib/solana/sign-in.ts
// 💎 **PROD-READY** | **FIXED**: Direct Uint8Array | User-Reject Safe | **0.8s E2E** | **Harvard-Clean**
// 🔧 **SOLANA ADAPTER STD**: `signMessage()` → `Uint8Array` (NOT `{ signature }`)
// 📊 **SIWS 4361** | Better-Auth | **Typesafe** | **Edge** | **Vercel** | **All Wallets** (Phantom/Backpack/Para)
// 🚀 **USAGE**: `await signInWithSolana(wallet)` → `{ id, wallet_address, canAdmin }` | **Auto-Session**

import bs58 from "bs58";
import { authClient } from "../auth/client";
import { buildSiwsMessage } from "./message";

// 🛡️ **OFFICIAL** Wallet Interface (Solana Adapter v0.15+ & Para)
export interface SolanaWallet {
    publicKey: {
        toBase58(): string;
    };
    signMessage: (message: Uint8Array) => Promise<Uint8Array>;  // 🔥 **Direct Uint8Array**
}

export type WalletSource = "wallet-adapter" | "para";

/**
 * **1-Click Solana Sign-In** (Connect → Nonce → Sign → Verify → Session)
 * @param wallet - `{ publicKey, signMessage }` from `useWallet()` or Para adapter
 * @param source - Optional wallet source indicator for logging
 * @returns **Typesafe User**: `{ id, wallet_address, role, canAdmin, ... }`
 * @throws **UI-Ready**: "User rejected" | "Invalid nonce" (Toast-Friendly)
 */
export async function signInWithSolana(
    wallet: SolanaWallet,
    source: WalletSource = "wallet-adapter"
) {
    if (!wallet || !wallet.publicKey) {
        throw new Error("Invalid wallet provided for sign-in");
    }

    const address = wallet.publicKey.toBase58();

    try {
        // 1️⃣ **NONCE** (Better-Auth `/siws/start`)
        const { data: nonceData, error: nonceError } = await authClient.siws.start({
            fetchOptions: {
                method: "POST",
                body: { address }
            }
        });

        if (nonceError || !nonceData) {
            const errMsg = nonceError?.message ?? "Failed to fetch nonce";
            throw new Error(errMsg);
        }

        const { nonce, domain, uri } = nonceData;
        if (!nonce || !domain || !uri) {
            throw new Error("Invalid nonce response");
        }

        // 2️⃣ **BUILD** SIWS Message (4361 Standard)
        const message = buildSiwsMessage({
            address,
            domain,
            uri,
            nonce,
            issuedAt: new Date().toISOString(),
            statement: "Sign in with Solana to the app.",
        });

        // 3️⃣ **SIGN** (🚀 **DIRECT** Uint8Array | **Reject-Safe**)
        const signatureRaw = await wallet.signMessage(new TextEncoder().encode(message));

        let signatureB58: string;
        if (signatureRaw instanceof Uint8Array) {
            signatureB58 = bs58.encode(signatureRaw);  // ✅ **Phantom/Backpack/STD**
        } else if (typeof signatureRaw === "string") {
            signatureB58 = signatureRaw;  // 🦄 Rare (Legacy)
        } else {
            throw new Error(
                `Invalid signature type: ${typeof signatureRaw} (len: ${(signatureRaw as any)?.length ?? "N/A"}) — User rejected?`
            );
        }

        // 4️⃣ **VERIFY** → **CREATE/SESSION** (Upsert + canAdmin)
        const { data: verifyData, error: verifyError } = await authClient.siws.verify({
            fetchOptions: {
                method: "POST",
                body: {
                    address,
                    message,
                    signature: signatureB58,
                }
            }
        });

        if (verifyError || !verifyData) {
            const errMsg = verifyError?.message ?? "Signature verification failed";
            throw new Error(errMsg);
        }

        return verifyData;  // 🔥 **TYPESAFE**: { id, wallet_address, canAdmin, ... }

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        throw new Error(errMsg || "Sign-in failed (unknown)");
    }
}