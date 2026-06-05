// Solana SIWS sign-in (Connect → Nonce → Sign → Verify → Session). Ported from sidebar.
// Solana adapter standard: signMessage(Uint8Array) → Uint8Array.

import bs58 from "bs58";
import { authClient } from "@/lib/auth/client";
import { buildSiwsMessage } from "./message";

export interface SolanaWallet {
  publicKey: { toBase58(): string } | null;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

export async function signInWithSolana(wallet: SolanaWallet) {
  if (!wallet || !wallet.publicKey || !wallet.signMessage) {
    throw new Error("Invalid wallet provided for sign-in");
  }

  const address = wallet.publicKey.toBase58();

  // better-auth-siws is untyped; the siws namespace is added at runtime by the client plugin.
  const siws = (authClient as unknown as {
    siws: {
      start: (o: { fetchOptions: { method: string; body: { address: string } } }) => Promise<{
        data: { nonce: string; domain: string; uri: string } | null;
        error: { message?: string } | null;
      }>;
      verify: (o: { fetchOptions: { method: string; body: { address: string; message: string; signature: string } } }) => Promise<{
        data: unknown;
        error: { message?: string } | null;
      }>;
    };
  }).siws;

  // 1) Nonce
  const { data: nonceData, error: nonceError } = await siws.start({
    fetchOptions: { method: "POST", body: { address } },
  });
  if (nonceError || !nonceData) {
    throw new Error(nonceError?.message ?? "Failed to fetch nonce");
  }

  const { nonce, domain, uri } = nonceData as { nonce: string; domain: string; uri: string };
  if (!nonce || !domain || !uri) {
    throw new Error("Invalid nonce response");
  }

  // 2) Build SIWS message
  const message = buildSiwsMessage({
    address,
    domain,
    uri,
    nonce,
    issuedAt: new Date().toISOString(),
    statement: "Sign in with Solana to the app.",
  });

  // 3) Sign (direct Uint8Array)
  const signatureRaw = await wallet.signMessage(new TextEncoder().encode(message));
  let signatureB58: string;
  if (signatureRaw instanceof Uint8Array) {
    signatureB58 = bs58.encode(signatureRaw);
  } else if (typeof signatureRaw === "string") {
    signatureB58 = signatureRaw;
  } else {
    throw new Error("Invalid signature — user rejected?");
  }

  // 4) Verify → session
  const { data: verifyData, error: verifyError } = await siws.verify({
    fetchOptions: { method: "POST", body: { address, message, signature: signatureB58 } },
  });
  if (verifyError || !verifyData) {
    throw new Error(verifyError?.message ?? "Signature verification failed");
  }

  return verifyData;
}
