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

  // TEMP diagnostic: verify the wallet's signature locally to isolate wallet vs
  // transport. local=false -> the wallet signed something other than these bytes;
  // local=true but server 401 -> the message/signature changed in transit.
  try {
    const ed = await import("@noble/ed25519");
    const local = await ed.verifyAsync(
      signatureRaw as Uint8Array,
      new TextEncoder().encode(message),
      bs58.decode(address),
    );
    console.log(
      "[siws] local verify:",
      local,
      "| sigLen:",
      (signatureRaw as Uint8Array).length,
      "pubLen:",
      bs58.decode(address).length,
      "msgLen:",
      message.length,
    );
  } catch (err) {
    console.log("[siws] local verify error:", err);
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
