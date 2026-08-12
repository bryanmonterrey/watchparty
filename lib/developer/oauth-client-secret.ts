// OAuth client-secret storage hash — byte-for-byte the defaultHasher that
// @better-auth/oauth-provider applies under `storeClientSecret: "hashed"`
// (verified 1.6.27 dist, utils defaultHasher): unpadded base64url of the
// SHA-256 of the utf8 secret. developerApps writes client rows directly (the
// plugin's CRUD endpoints are blocked), so the hash it stores MUST match what
// the plugin's token endpoint recomputes at verification, or every exchange
// fails with invalid_client. WebCrypto, so it runs on Workers and in bun
// scripts alike.
export async function hashOAuthClientSecret(secret: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const bytes = new Uint8Array(digest);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
