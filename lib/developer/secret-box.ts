// At-rest encryption for webhook signing secrets. AES-256-GCM under a key
// HKDF-derived from API_GATE_SECRET — no new env var to provision, and the
// same secret already gates the whole developer platform (a deployment
// without it can't create API keys either). WebCrypto only (workerd-safe).
//
// Stored form: `enc1:<iv b64>:<ciphertext b64>`. openSecret passes through
// anything without the prefix so a stray plaintext row can never brick
// delivery — it just stays unencrypted until the next reset.

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
}

function b64decode(s: string): Uint8Array {
    const raw = atob(s);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

let cachedKey: Promise<CryptoKey> | null = null;

function aesKey(): Promise<CryptoKey> {
    if (cachedKey) return cachedKey;
    const secret = process.env.API_GATE_SECRET;
    if (!secret) throw new Error("API_GATE_SECRET is not set");
    cachedKey = (async () => {
        const material = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, [
            "deriveKey",
        ]);
        return crypto.subtle.deriveKey(
            {
                name: "HKDF",
                hash: "SHA-256",
                salt: enc.encode("wp-webhook-secret-v1"),
                info: new Uint8Array(0),
            },
            material,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"],
        );
    })();
    return cachedKey;
}

export async function sealSecret(plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), enc.encode(plaintext));
    return `enc1:${b64encode(iv)}:${b64encode(new Uint8Array(ct))}`;
}

export async function openSecret(stored: string): Promise<string> {
    if (!stored.startsWith("enc1:")) return stored;
    const [, ivB64, ctB64] = stored.split(":");
    const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64decode(ivB64) as BufferSource },
        await aesKey(),
        b64decode(ctB64) as BufferSource,
    );
    return dec.decode(pt);
}
