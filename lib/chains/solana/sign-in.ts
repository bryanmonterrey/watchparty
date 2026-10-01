// Solana SIWS sign-in (Connect → Nonce → Sign → Verify → Session).
// Hits the better-auth-siws endpoints directly (like the EVM SIWE flow) so we
// can surface the exact verify failure — the plugin returns PLAIN-TEXT errors
// ("Domain mismatch" / "Nonce invalid or expired" / "Invalid signature"), which
// the auth client would otherwise collapse into a generic message.

import bs58 from "bs58";
import { buildSiwsMessage } from "./message";

const AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL ??
  (typeof window !== "undefined" ? `${window.location.origin}/api/auth` : "http://localhost:3001/api/auth");

export interface SolanaWallet {
  publicKey: { toBase58(): string } | null;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

export async function signInWithSolana(wallet: SolanaWallet) {
  if (!wallet || !wallet.publicKey || !wallet.signMessage) {
    throw new Error("Invalid wallet provided for sign-in");
  }

  const address = wallet.publicKey.toBase58();

  // 1) Nonce — POST /siws/start { address } -> { nonce, domain, uri }
  const startRes = await fetch(`${AUTH_URL}/siws/start`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!startRes.ok) {
    throw new Error(`Couldn't start Solana sign-in (${startRes.status}).`);
  }
  const { nonce, domain, uri } = (await startRes.json()) as { nonce: string; domain: string; uri: string };
  if (!nonce || !domain || !uri) {
    throw new Error("Invalid nonce response from /siws/start.");
  }

  // 2) Build the SIWS message — the plugin verifies the signature over this exact
  //    string and checks it starts with "<domain> wants you to sign in".
  const message = buildSiwsMessage({
    address,
    domain,
    uri,
    nonce,
    issuedAt: new Date().toISOString(),
    statement: "Sign in with Solana to the app.",
  });

  // 3) Sign (raw Uint8Array → base58)
  const signatureRaw = await wallet.signMessage(new TextEncoder().encode(message));
  const signature =
    signatureRaw instanceof Uint8Array
      ? bs58.encode(signatureRaw)
      : typeof signatureRaw === "string"
        ? signatureRaw
        : null;
  if (!signature) {
    throw new Error("Invalid signature — user rejected?");
  }

  // DIAGNOSTIC: self-verify the wallet's signature locally with the SAME check the
  // server runs (ed25519 over the exact message+address). The deployed server is
  // proven good (a controlled keypair signs in fine), so a 401 here means the
  // wallet's sig/pubkey/message don't line up — this log says which.
  try {
    const ed = await import("@noble/ed25519");
    // sha2.js exists in @noble/hashes 1.8 and 2.x; the sha512 entry was dropped in 2.0.
    const { sha512 } = await import("@noble/hashes/sha2.js");
    if (!ed.etc.sha512Sync) ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));
    const sigBytes = bs58.decode(signature);
    const addrBytes = bs58.decode(address);
    const msgBytes = new TextEncoder().encode(message);
    const localOk = ed.verify(sigBytes, msgBytes, addrBytes);
    console.log(
      `[siws] self-verify=${localOk} | rawSigType=${(signatureRaw as { constructor?: { name?: string } })?.constructor?.name} ` +
        `sigLen=${sigBytes.length} addrLen=${addrBytes.length} msgLen=${msgBytes.length}`,
    );
    console.log("[siws] address:", address);
    console.log("[siws] message:", JSON.stringify(message));
  } catch (e) {
    console.warn("[siws] self-verify threw:", e);
  }

  // 4) Verify → session
  const verifyRes = await fetch(`${AUTH_URL}/siws/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, message, signature }),
  });
  if (!verifyRes.ok) {
    const reason = (await verifyRes.text().catch(() => "")) || "verification rejected";
    throw new Error(`Solana sign-in failed (${verifyRes.status}): ${reason}`);
  }
  return verifyRes.json().catch(() => ({}));
}
