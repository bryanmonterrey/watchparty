import { ed25519 } from "@noble/curves/ed25519.js";
import { sealSecret, openSecret } from "@/lib/developer/secret-box";

// Ed25519 identity for a developer app — the trust model behind every
// platform→app signed delivery (interactions, event webhooks). The developer
// holds ONLY the public key (safe to display and leak); we keep the private
// half sealed at rest and sign with it. Mirrors Discord's verify_key model.
//
// @noble/curves (already a dep, used by lib/frost) is deterministic and
// workerd-safe — no WebCrypto Ed25519 quirks across runtimes.

function hex(bytes: Uint8Array): string {
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function unhex(s: string): Uint8Array {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return out;
}

export interface AppKeypair {
    /** hex-encoded Ed25519 public key — shown in the console, safe to leak */
    publicKey: string;
    /** sealed (AES-GCM) private key for storage — never leaves the server */
    privateKeyEnc: string;
}

export async function generateAppKeypair(): Promise<AppKeypair> {
    const sk = ed25519.utils.randomSecretKey();
    const pk = ed25519.getPublicKey(sk);
    return { publicKey: hex(pk), privateKeyEnc: await sealSecret(hex(sk)) };
}

/** Sign `timestamp + rawBody` with the app's private key (hex signature). */
export async function signAppDelivery(
    privateKeyEnc: string,
    timestamp: string,
    rawBody: string,
): Promise<string> {
    const sk = unhex(await openSecret(privateKeyEnc));
    const msg = new TextEncoder().encode(`${timestamp}${rawBody}`);
    return hex(ed25519.sign(msg, sk));
}
