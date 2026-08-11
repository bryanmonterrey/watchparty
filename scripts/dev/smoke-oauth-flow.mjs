#!/usr/bin/env node
/**
 * End-to-end smoke for the OAuth2/OIDC identity provider ("Sign in with
 * watchparty"). tsc cannot see a single one of the bugs this exercises —
 * PKCE not enforced, codes reusable, redirect near-misses accepted, scope
 * leaks in userinfo, disabled clients still serving tokens, refresh tokens
 * that never die. This script is the gate that matters (CLAUDE.md).
 *
 *   bun scripts/dev/smoke-oauth-flow.mjs                       # local next start (:3001)
 *   BASE_URL=https://watchparty.xyz bun scripts/dev/smoke-oauth-flow.mjs --production
 *
 * Needs: a running server at BASE_URL whose DB this script can also reach
 * (it seeds its own throwaway OAuth client row and deletes it afterwards),
 * and BETTER_AUTH_SECRET/API_GATE_SECRET in env for cookie/secret sealing.
 * The session cookie is minted via scripts/dev/mint-test-session.mjs.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";

const PROD = process.argv.includes("--production");
const BASE = process.env.BASE_URL ?? "http://localhost:3001";

// ── env (same resolution as mint-test-session) ──────────────────────────────
function readEnv(file) {
    const out = {};
    try {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
            if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
    } catch { /* absent */ }
    return out;
}
const env = PROD ? readEnv(".env") : { ...readEnv(".env"), ...readEnv(".env.local") };
for (const [k, v] of Object.entries(env)) if (v && !process.env[k]) process.env[k] = v;

// ── seed: throwaway client + session cookie ─────────────────────────────────
const { db } = await import("../../db/index.ts");
const { oauthApplication, oauthAccessToken, oauthConsent } = await import("../../db/schema/auth/index.ts");
const { sealSecret } = await import("../../lib/developer/secret-box.ts");
const { eq } = await import("drizzle-orm");

const cookie = execFileSync(
    "bun",
    ["scripts/dev/mint-test-session.mjs", "--raw", ...(PROD ? ["--yes-production"] : [])],
    { encoding: "utf8" },
).trim();

const CLIENT_ID = `wpcl_smoke_${Date.now().toString(36)}`;
const CLIENT_SECRET = [...webcrypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
const REDIRECT = "https://oauth-smoke.example.com/callback";

await db.insert(oauthApplication).values({
    id: webcrypto.randomUUID(),
    name: "OAuth smoke client",
    clientId: CLIENT_ID,
    clientSecret: await sealSecret(CLIENT_SECRET),
    redirectUrls: REDIRECT,
    type: "web",
    disabled: false,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
});

let failures = 0;
const ok = (cond, label, detail = "") => {
    if (cond) console.log(`  ✓ ${label}`);
    else {
        failures++;
        console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    }
};

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (s) => createHash("sha256").update(s).digest();

// PKCE pair
const verifier = b64url(webcrypto.getRandomValues(new Uint8Array(32)));
const challenge = b64url(sha256(verifier));

const authorizeUrl = (over = {}) => {
    const q = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT,
        scope: "openid profile email offline_access",
        state: "smoke-state-1",
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...over,
    });
    for (const [k, v] of Object.entries(over)) if (v === null) q.delete(k);
    return `${BASE}/api/auth/oauth2/authorize?${q}`;
};

const get = (url, extra = {}) =>
    fetch(url, { redirect: "manual", headers: { cookie, ...extra.headers }, ...extra });

async function tokenPost(params) {
    const res = await fetch(`${BASE}/api/auth/oauth2/token`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, body };
}

async function runConsent(consentUrl) {
    const u = new URL(consentUrl, BASE);
    const consentCode = u.searchParams.get("consent_code");
    const res = await fetch(`${BASE}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ accept: true, ...(consentCode ? { consent_code: consentCode } : {}) }),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, redirectURI: body?.redirectURI ?? null, consentCode };
}

/** Full happy-path authorize→consent→code. Returns the auth code. */
async function obtainCode() {
    const authRes = await get(authorizeUrl());
    const loc = authRes.headers.get("location") ?? "";
    if (!loc.includes("/oauth/consent")) {
        // Already-consented sessions skip the consent screen and go straight
        // to the redirect_uri with a code.
        const url = new URL(loc);
        return url.searchParams.get("code");
    }
    const { redirectURI } = await runConsent(loc);
    return redirectURI ? new URL(redirectURI).searchParams.get("code") : null;
}

try {
    console.log(`\nOAuth2 IdP smoke against ${BASE}\n`);

    // 1. Discovery + JWKS
    {
        const disco = await (await fetch(`${BASE}/api/auth/.well-known/openid-configuration`)).json().catch(() => null);
        ok(disco?.authorization_endpoint?.includes("/oauth2/authorize"), "discovery document served");
        ok(
            Array.isArray(disco?.code_challenge_methods_supported) &&
            disco.code_challenge_methods_supported.includes("S256") &&
            !disco.code_challenge_methods_supported.includes("plain"),
            "discovery advertises S256 only",
        );
    }

    // 2. redirect_uri exact match — near-miss must 400, never redirect
    for (const bad of [
        `${REDIRECT}/extra`,
        REDIRECT.replace("https", "http"),
        "https://oauth-smoke.example.com.evil.com/callback",
    ]) {
        const res = await get(authorizeUrl({ redirect_uri: bad }));
        const loc = res.headers.get("location") ?? "";
        ok(
            res.status === 400 || loc.includes("/api/auth/error"),
            `near-miss redirect_uri rejected (${bad.slice(0, 50)})`,
            `status ${res.status}, location ${loc.slice(0, 80)}`,
        );
        ok(!loc.startsWith(bad), "…and never redirected to the attacker URI");
    }

    // 3. PKCE enforcement — missing challenge and plain method both refused.
    //    (These arrive as error params on the REGISTERED redirect, per RFC.)
    {
        const noPkce = await get(authorizeUrl({ code_challenge: null, code_challenge_method: null }));
        const loc = noPkce.headers.get("location") ?? "";
        ok(loc.includes("error=invalid_request"), "authorize without code_challenge refused (requirePKCE took)", loc.slice(0, 120));

        const plain = await get(authorizeUrl({ code_challenge: verifier, code_challenge_method: "plain" }));
        const locP = plain.headers.get("location") ?? "";
        ok(locP.includes("error="), "plain code_challenge_method refused", locP.slice(0, 120));
    }

    // 4. Happy path: authorize → consent screen → code → token → userinfo
    let tokens = null;
    {
        const authRes = await get(authorizeUrl());
        const loc = authRes.headers.get("location") ?? "";
        ok(loc.includes("/oauth/consent") && loc.includes("consent_code="), "authorize redirects to the consent screen", loc.slice(0, 120));

        const consent = await runConsent(loc);
        ok(consent.status === 200 && !!consent.redirectURI, "consent accept returns redirectURI");
        const cbUrl = consent.redirectURI ? new URL(consent.redirectURI) : null;
        const code = cbUrl?.searchParams.get("code");
        ok(!!code, "authorization code issued");
        ok(cbUrl?.searchParams.get("state") === "smoke-state-1", "state echoed back");

        const exchange = await tokenPost({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code_verifier: verifier,
        });
        ok(exchange.status === 200 && !!exchange.body?.access_token, "code + verifier + secret exchange succeeds", JSON.stringify(exchange.body).slice(0, 120));
        ok(!!exchange.body?.refresh_token, "refresh token issued (offline_access)");
        ok(!!exchange.body?.id_token, "id_token issued");
        tokens = exchange.body;

        // Same code again must be dead (single-use via consumeVerificationValue)
        const replay = await tokenPost({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code_verifier: verifier,
        });
        ok(replay.status >= 400, "authorization code is single-use");

        // id_token verifies against the JWKS (EdDSA via the jwt plugin)
        if (tokens?.id_token) {
            const [h, p, s] = tokens.id_token.split(".");
            const header = JSON.parse(Buffer.from(h, "base64url").toString());
            const jwksRes = await (await fetch(`${BASE}/api/auth/jwks`)).json().catch(() => null);
            const jwk = jwksRes?.keys?.find((k) => k.kid === header.kid) ?? jwksRes?.keys?.[0];
            if (jwk?.kty === "OKP") {
                const key = await webcrypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]);
                const valid = await webcrypto.subtle.verify(
                    "Ed25519",
                    key,
                    Buffer.from(s, "base64url"),
                    Buffer.from(`${h}.${p}`),
                );
                ok(valid, "id_token signature verifies against /api/auth/jwks (EdDSA)");
                const claims = JSON.parse(Buffer.from(p, "base64url").toString());
                ok(claims.aud === CLIENT_ID, "id_token aud is the client");
            } else {
                ok(false, "JWKS serves an OKP (EdDSA) key", `got ${jwk?.kty ?? "none"} — HS256 fallback would sign with the SEALED secret`);
            }
        }
    }

    // 5. Wrong credentials at the token endpoint
    {
        const fresh = await obtainCode();
        ok(!!fresh, "second code obtained (consent remembered)");
        const wrongSecret = await tokenPost({
            grant_type: "authorization_code", code: fresh, redirect_uri: REDIRECT,
            client_id: CLIENT_ID, client_secret: "not-the-secret", code_verifier: verifier,
        });
        ok(wrongSecret.status >= 400, "wrong client_secret refused");
        // that failure burned the code (consumed before client auth — fail closed); get another
        const fresh2 = await obtainCode();
        const wrongVerifier = await tokenPost({
            grant_type: "authorization_code", code: fresh2, redirect_uri: REDIRECT,
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code_verifier: `${verifier}x`,
        });
        ok(wrongVerifier.status >= 400, "wrong code_verifier refused");
    }

    // 6. userinfo — scope filtering + auth
    if (tokens?.access_token) {
        const ui = await fetch(`${BASE}/api/auth/oauth2/userinfo`, {
            headers: { authorization: `Bearer ${tokens.access_token}` },
        });
        const claims = await ui.json().catch(() => null);
        ok(ui.status === 200 && !!claims?.sub, "userinfo serves claims for a live token");
        ok("email" in (claims ?? {}), "email claim present (email scope granted)");
        const noAuth = await fetch(`${BASE}/api/auth/oauth2/userinfo`);
        ok(noAuth.status >= 400, "userinfo without a token refused");
        const badTok = await fetch(`${BASE}/api/auth/oauth2/userinfo`, { headers: { authorization: "Bearer nonsense" } });
        ok(badTok.status >= 400, "userinfo with a garbage token refused");
    }

    // 7. Refresh rotation — new pair issued, presented refresh token dies
    if (tokens?.refresh_token) {
        const r1 = await tokenPost({
            grant_type: "refresh_token", refresh_token: tokens.refresh_token,
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        });
        ok(r1.status === 200 && !!r1.body?.refresh_token, "refresh grant issues a new pair");
        const replay = await tokenPost({
            grant_type: "refresh_token", refresh_token: tokens.refresh_token,
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        });
        ok(replay.status >= 400, "OLD refresh token is dead after rotation (cleanup plugin)");
        if (r1.body?.refresh_token) tokens.refresh_token = r1.body.refresh_token;
        if (r1.body?.access_token) tokens.access_token = r1.body.access_token;
    }

    // 8. Deny flow
    {
        const authRes = await get(authorizeUrl({ state: "smoke-deny", prompt: "consent" }));
        const loc = authRes.headers.get("location") ?? "";
        if (loc.includes("/oauth/consent")) {
            const u = new URL(loc, BASE);
            const res = await fetch(`${BASE}/api/auth/oauth2/consent`, {
                method: "POST",
                headers: { "content-type": "application/json", cookie },
                body: JSON.stringify({ accept: false, consent_code: u.searchParams.get("consent_code") }),
            });
            const body = await res.json().catch(() => null);
            ok(body?.redirectURI?.includes("error=access_denied"), "deny returns access_denied at the redirect URI");
        } else {
            ok(false, "deny flow reached a consent screen", `location: ${loc.slice(0, 100)}`);
        }
    }

    // 9. Dynamic registration is 404'd at the edge
    {
        const reg = await fetch(`${BASE}/api/auth/oauth2/register`, {
            method: "POST",
            headers: { "content-type": "application/json", cookie },
            body: JSON.stringify({ redirect_uris: ["https://evil.example.com/cb"] }),
        });
        ok(reg.status === 404, "POST /oauth2/register is 404 (middleware block)", `status ${reg.status}`);
    }

    // 10. Disable revokes — same operations developerApps.setOAuthClientDisabled runs
    if (tokens?.access_token) {
        await db.update(oauthApplication).set({ disabled: true, updatedAt: new Date() }).where(eq(oauthApplication.clientId, CLIENT_ID));
        await db.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, CLIENT_ID));
        await db.delete(oauthConsent).where(eq(oauthConsent.clientId, CLIENT_ID));
        const ui = await fetch(`${BASE}/api/auth/oauth2/userinfo`, {
            headers: { authorization: `Bearer ${tokens.access_token}` },
        });
        ok(ui.status >= 400, "tokens are dead after client disable (rows deleted — userinfo ignores `disabled`)");
        const refreshDead = await tokenPost({
            grant_type: "refresh_token", refresh_token: tokens.refresh_token,
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        });
        ok(refreshDead.status >= 400, "refresh is dead after client disable");
    }

    // 11. Rate limit — burst the token endpoint; expect a 429 somewhere.
    //     Fail-open by design (Upstash down ⇒ no 429), so this only warns.
    {
        let saw429 = false;
        for (let i = 0; i < 25 && !saw429; i++) {
            const r = await tokenPost({ grant_type: "authorization_code", code: "x", redirect_uri: REDIRECT, client_id: CLIENT_ID, client_secret: "x", code_verifier: "x" });
            if (r.status === 429) saw429 = true;
        }
        if (saw429) console.log("  ✓ token endpoint rate limit returns 429 under burst");
        else console.warn("  ⚠ no 429 under burst — acceptable only if Upstash is unreachable from here (limiter is fail-open)");
    }
} finally {
    // ── cleanup: the throwaway client and anything it issued ────────────────
    await db.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, CLIENT_ID)).catch(() => {});
    await db.delete(oauthConsent).where(eq(oauthConsent.clientId, CLIENT_ID)).catch(() => {});
    await db.delete(oauthApplication).where(eq(oauthApplication.clientId, CLIENT_ID)).catch(() => {});
}

console.log(failures === 0 ? "\nAll OAuth smoke checks passed.\n" : `\n${failures} CHECK(S) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
