#!/usr/bin/env node
/**
 * End-to-end smoke for the OAuth2/OIDC identity provider ("Sign in with
 * watchparty"), rewritten for @better-auth/oauth-provider. tsc cannot see a
 * single one of the bugs this exercises — PKCE not enforced, codes reusable,
 * redirect near-misses accepted, scope leaks in userinfo, disabled clients
 * still serving tokens, refresh families surviving replay. This script is
 * the gate that matters (CLAUDE.md).
 *
 *   bun scripts/dev/smoke-oauth-flow.mjs                       # local next start (:3001)
 *   BASE_URL=https://watchparty.xyz bun scripts/dev/smoke-oauth-flow.mjs --production
 *
 * Needs: a running server at BASE_URL whose DB this script can also reach
 * (it seeds its own throwaway OAuth client row and deletes it afterwards),
 * and BETTER_AUTH_SECRET/API_GATE_SECRET in env for cookie minting. The
 * session cookie is minted via scripts/dev/mint-test-session.mjs.
 *
 * Contract differences from the old oidc-provider smoke, all source-verified
 * against the 1.6.27 dist:
 * - authorize redirects to the consent page with the WHOLE query HMAC-signed
 *   (`sig`, `ba_param` name list, `ba_iat`, `exp`) — no consent_code/cookie.
 * - consent POSTs {accept, oauth_query} where oauth_query is the signed
 *   subset of the page's search params; the response is {redirect, url}.
 * - tokens come back prefixed (wpat_/wprt_) and are stored HASHED.
 * - refresh replay doesn't just fail: it invalidates the whole family
 *   (RFC 9700) — the freshly-rotated token must die too.
 * - RFC 7662 introspect + RFC 7009 revoke exist and honor client auth.
 * - /oauth2/register AND the client CRUD set are 404'd at the edge.
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
// UNCONDITIONAL assignment (mint-test-session does the same): bun auto-loads
// .env.local into process.env before this script runs, so a "don't override"
// guard would silently keep the DEV DATABASE_URL in --production mode — the
// seeded client lands in dev while the prod app looks in prod, and every
// check fails with invalid_client. Found the hard way 2026-08-11.
for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v;

// ── seed: throwaway client + session cookie ─────────────────────────────────
const { db } = await import("../../db/index.ts");
const { oauthClient, oauthAccessToken, oauthRefreshToken, oauthConsent } = await import("../../db/schema/auth/index.ts");
const { eq } = await import("drizzle-orm");

const mintedCookie = execFileSync(
    "bun",
    ["scripts/dev/mint-test-session.mjs", "--raw", ...(PROD ? ["--yes-production"] : [])],
    { encoding: "utf8" },
).trim();
// The server resolves the cookie NAME from useSecureCookies (NODE_ENV) — a
// local `next start` is NODE_ENV=production and wants the __Secure- prefix,
// while dev wants the bare name. The __Secure- rules only constrain browsers
// SETTING cookies, not servers reading a request header, so send the session
// under BOTH names and let the server pick the one it's configured for.
const cookieValue = mintedCookie.replace(/^[^=]+=/, "");
const cookie = `better-auth.session_token=${cookieValue}; __Secure-better-auth.session_token=${cookieValue}`;

const CLIENT_ID = `wpcl_smoke_${Date.now().toString(36)}`;
const CLIENT_SECRET = `wpsk_${[...webcrypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
const REDIRECT = "https://oauth-smoke.example.com/callback";

// The plugin's defaultHasher (storeClientSecret: "hashed"): unpadded
// base64url(sha256). Must match lib/developer/oauth-client-secret.ts.
const hashSecret = (s) => createHash("sha256").update(s, "utf8").digest("base64url");

function clientRow(clientId, { secret, isPublic }) {
    const now = new Date();
    return {
        id: webcrypto.randomUUID(),
        clientId,
        clientSecret: secret ? hashSecret(secret) : null,
        name: "OAuth smoke client",
        redirectUris: [REDIRECT],
        tokenEndpointAuthMethod: isPublic ? "none" : "client_secret_post",
        grantTypes: ["authorization_code", "refresh_token"],
        responseTypes: ["code"],
        public: isPublic,
        type: isPublic ? "native" : "web",
        disabled: false,
        createdAt: now,
        updatedAt: now,
    };
}

await db.insert(oauthClient).values(clientRow(CLIENT_ID, { secret: CLIENT_SECRET, isPublic: false }));

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

/** RFC 7662 / RFC 7009 — form-encoded, client-authenticated. */
async function protocolPost(path, params) {
    const res = await fetch(`${BASE}/api/auth/oauth2/${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, body };
}

/** The signed subset of a consent-page URL's params — what the consent card
 *  sends as oauth_query (mirrors buildSignedOAuthQuery). */
function signedQueryFrom(consentUrl) {
    const params = new URL(consentUrl, BASE).searchParams;
    if (!params.has("sig")) return null;
    const names = new Set(params.getAll("ba_param"));
    const signed = new URLSearchParams();
    for (const [k, v] of params.entries()) {
        if (k === "sig" || k === "ba_param" || names.has(k)) signed.append(k, v);
    }
    return signed.toString();
}

async function runConsent(consentUrl, accept = true) {
    const oauthQuery = signedQueryFrom(consentUrl);
    // `origin` is REQUIRED: better-auth's CSRF check 403s an origin-less POST
    // (MISSING_OR_NULL_ORIGIN). Browsers always send it from the consent page;
    // a bare server-side fetch must add it explicitly.
    const res = await fetch(`${BASE}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin: BASE },
        body: JSON.stringify({ accept, ...(oauthQuery ? { oauth_query: oauthQuery } : {}) }),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, url: body?.url ?? null, oauthQuery };
}

/** Full happy-path authorize→consent→code. Returns the auth code. */
async function obtainCode(clientId = CLIENT_ID, state = "smoke-state-n") {
    const authRes = await get(authorizeUrl({ client_id: clientId, state }));
    const loc = authRes.headers.get("location") ?? "";
    if (!loc.includes("/oauth/consent")) {
        // Already-consented sessions skip the consent screen and go straight
        // to the redirect_uri with a code. Anything else (a /login bounce,
        // an error page) has no code — return null rather than crash.
        return new URL(loc, BASE).searchParams.get("code");
    }
    const { url } = await runConsent(loc);
    return url ? new URL(url).searchParams.get("code") : null;
}

try {
    console.log(`\nOAuth2 IdP smoke (oauth-provider) against ${BASE}\n`);

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
        ok(disco?.introspection_endpoint?.includes("/oauth2/introspect"), "discovery advertises introspection (RFC 7662)");
        ok(disco?.revocation_endpoint?.includes("/oauth2/revoke"), "discovery advertises revocation (RFC 7009)");
    }

    // 2. redirect_uri exact match — near-miss must never redirect to attacker
    for (const bad of [
        `${REDIRECT}/extra`,
        REDIRECT.replace("https", "http"),
        "https://oauth-smoke.example.com.evil.com/callback",
    ]) {
        const res = await get(authorizeUrl({ redirect_uri: bad }));
        const loc = res.headers.get("location") ?? "";
        ok(
            res.status === 400 || loc.includes("/api/auth/error") || loc.includes("error="),
            `near-miss redirect_uri rejected (${bad.slice(0, 50)})`,
            `status ${res.status}, location ${loc.slice(0, 80)}`,
        );
        ok(!loc.startsWith(bad), "…and never redirected to the attacker URI");
    }

    // 3. PKCE is structural — missing challenge and non-S256 refused.
    {
        const noPkce = await get(authorizeUrl({ code_challenge: null, code_challenge_method: null }));
        const loc = noPkce.headers.get("location") ?? "";
        ok(loc.includes("error=invalid_request"), "authorize without code_challenge refused (PKCE structural)", loc.slice(0, 120));

        const plain = await get(authorizeUrl({ code_challenge: verifier, code_challenge_method: "plain" }));
        const locP = plain.headers.get("location") ?? "";
        ok(locP.includes("error=") || plain.status === 400, "plain code_challenge_method refused", locP.slice(0, 120));
    }

    // 4. Happy path: authorize → signed consent → code → token → userinfo
    let tokens = null;
    {
        const authRes = await get(authorizeUrl());
        const loc = authRes.headers.get("location") ?? "";
        ok(loc.includes("/oauth/consent"), "authorize redirects to the consent screen", loc.slice(0, 120));
        ok(loc.includes("sig=") && loc.includes("ba_param="), "consent redirect carries the signed query (sig + ba_param)");

        const consent = await runConsent(loc);
        ok(consent.status === 200 && !!consent.url, "consent accept returns {redirect, url}", `status ${consent.status}`);
        const cbUrl = consent.url ? new URL(consent.url) : null;
        const code = cbUrl?.searchParams.get("code");
        ok(!!code, "authorization code issued");
        ok(cbUrl?.searchParams.get("state") === "smoke-state-1", "state echoed back");

        // Tampered signature must be refused.
        const tampered = await fetch(`${BASE}/api/auth/oauth2/consent`, {
            method: "POST",
            headers: { "content-type": "application/json", cookie, origin: BASE },
            body: JSON.stringify({ accept: true, oauth_query: consent.oauthQuery.replace(/sig=[^&]+/, "sig=AAAA") }),
        });
        ok(tampered.status >= 400, "consent with a tampered signature refused", `status ${tampered.status}`);

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
        ok(exchange.body?.access_token?.startsWith("wpat_") || exchange.body?.access_token?.split(".").length === 3,
            "access token carries the wpat_ prefix (or is a JWT)", exchange.body?.access_token?.slice(0, 12));
        ok(exchange.body?.refresh_token?.startsWith("wprt_"), "refresh token carries the wprt_ prefix", exchange.body?.refresh_token?.slice(0, 12));
        tokens = exchange.body;

        // Same code again must be dead (single-use)
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
                ok(claims.aud === CLIENT_ID || claims.azp === CLIENT_ID, "id_token audience is the client");
            } else {
                ok(false, "JWKS serves an OKP (EdDSA) key", `got ${jwk?.kty ?? "none"} — HS256 fallback would sign with the client secret`);
            }
        }
    }

    // 5. Wrong credentials at the token endpoint
    {
        const fresh = await obtainCode();
        ok(!!fresh, "second code obtained (consent remembered — no re-prompt)");
        const wrongSecret = await tokenPost({
            grant_type: "authorization_code", code: fresh, redirect_uri: REDIRECT,
            client_id: CLIENT_ID, client_secret: "wpsk_not_the_secret", code_verifier: verifier,
        });
        ok(wrongSecret.status >= 400, "wrong client_secret refused");
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
        ok("username" in (claims ?? {}), "custom profile claim present (customUserInfoClaims)");
        const noAuth = await fetch(`${BASE}/api/auth/oauth2/userinfo`);
        ok(noAuth.status >= 400, "userinfo without a token refused");
        const badTok = await fetch(`${BASE}/api/auth/oauth2/userinfo`, { headers: { authorization: "Bearer wpat_nonsense" } });
        ok(badTok.status >= 400, "userinfo with a garbage token refused");
    }

    // 7. RFC 7662 introspection — live token active, client auth required
    if (tokens?.access_token) {
        const alive = await protocolPost("introspect", {
            token: tokens.access_token, token_type_hint: "access_token",
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        });
        ok(alive.status === 200 && alive.body?.active === true, "introspect reports a live access token active", JSON.stringify(alive.body).slice(0, 100));
        const noAuthIntro = await protocolPost("introspect", { token: tokens.access_token, client_id: CLIENT_ID, client_secret: "wpsk_wrong" });
        ok(noAuthIntro.status >= 400 || noAuthIntro.body?.active === false, "introspect with wrong client auth refused");
    }

    // 8. Refresh rotation + FAMILY invalidation (RFC 9700)
    if (tokens?.refresh_token) {
        const firstRefresh = tokens.refresh_token;
        const r1 = await tokenPost({
            grant_type: "refresh_token", refresh_token: firstRefresh,
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        });
        ok(r1.status === 200 && !!r1.body?.refresh_token, "refresh grant issues a new pair");
        const replay = await tokenPost({
            grant_type: "refresh_token", refresh_token: firstRefresh,
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        });
        ok(replay.status >= 400, "replayed refresh token refused (atomic rotation)");
        // The replay must have killed the WHOLE family — the rotated token too.
        const familyDead = await tokenPost({
            grant_type: "refresh_token", refresh_token: r1.body?.refresh_token,
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        });
        ok(familyDead.status >= 400, "family invalidated after replay — rotated token dead too (RFC 9700)");
    }

    // 9. RFC 7009 revocation — fresh grant, revoke the access token, verify dead
    {
        const code = await obtainCode(CLIENT_ID, "smoke-revoke");
        const grant = code ? await tokenPost({
            grant_type: "authorization_code", code, redirect_uri: REDIRECT,
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code_verifier: verifier,
        }) : { body: null };
        if (grant.body?.access_token) {
            const revoked = await protocolPost("revoke", {
                token: grant.body.access_token, token_type_hint: "access_token",
                client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
            });
            ok(revoked.status === 200, "revoke accepts the access token (RFC 7009)", `status ${revoked.status}`);
            const after = await fetch(`${BASE}/api/auth/oauth2/userinfo`, {
                headers: { authorization: `Bearer ${grant.body.access_token}` },
            });
            ok(after.status >= 400, "revoked access token refused at userinfo");
            // A dead token SHOULD introspect as 200 {active:false} (RFC
            // 7662), and the plugin tries to: its catch maps BAD_REQUEST
            // APIErrors to {active:false}. But it tests `error.name ===
            // "BAD_REQUEST"` while better-call's APIError always has name
            // "APIError" (the status lives in error.status) — so the mapping
            // never fires and a dead token 400s with error=invalid_request
            // instead. UPSTREAM BUG (1.6.27, introspectEndpoint outer catch);
            // functionally still "not active", so accept both shapes and
            // re-check on every plugin bump.
            const introAfter = await protocolPost("introspect", {
                token: grant.body.access_token, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
            });
            ok(
                introAfter.body?.active === false ||
                (introAfter.status === 400 && introAfter.body?.error === "invalid_request"),
                "introspect refuses a revoked token (400 invalid_request — upstream {active:false} mapping bug)",
                JSON.stringify(introAfter.body).slice(0, 100),
            );
            tokens = grant.body; // keep for the disable check below (refresh_token still live)
        } else {
            ok(false, "revocation flow obtained a grant", JSON.stringify(grant.body).slice(0, 100));
        }
    }

    // 10. Deny flow
    {
        const authRes = await get(authorizeUrl({ state: "smoke-deny", prompt: "consent" }));
        const loc = authRes.headers.get("location") ?? "";
        if (loc.includes("/oauth/consent")) {
            const denied = await runConsent(loc, false);
            ok(denied.url?.includes("error=access_denied"), "deny returns access_denied at the redirect URI", denied.url?.slice(0, 100));
        } else {
            ok(false, "deny flow reached a consent screen", `location: ${loc.slice(0, 100)}`);
        }
    }

    // 11. Registration + client CRUD are dark (middleware 404)
    for (const [path, body] of [
        ["register", { redirect_uris: ["https://evil.example.com/cb"] }],
        ["create-client", { redirect_uris: ["https://evil.example.com/cb"] }],
        ["update-client", { client_id: CLIENT_ID, redirect_uris: ["https://evil.example.com/cb"] }],
        ["delete-client", { client_id: CLIENT_ID }],
        ["client/rotate-secret", { client_id: CLIENT_ID }],
    ]) {
        const res = await fetch(`${BASE}/api/auth/oauth2/${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", cookie, origin: BASE },
            body: JSON.stringify(body),
        });
        ok(res.status === 404, `POST /oauth2/${path} is 404 (edge block)`, `status ${res.status}`);
    }

    // 12. Disable revokes — same operations developerApps.setOAuthClientDisabled runs
    if (tokens?.access_token) {
        await db.update(oauthClient).set({ disabled: true, updatedAt: new Date() }).where(eq(oauthClient.clientId, CLIENT_ID));
        await db.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, CLIENT_ID));
        await db.delete(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, CLIENT_ID));
        await db.delete(oauthConsent).where(eq(oauthConsent.clientId, CLIENT_ID));
        const ui = await fetch(`${BASE}/api/auth/oauth2/userinfo`, {
            headers: { authorization: `Bearer ${tokens.access_token}` },
        });
        ok(ui.status >= 400, "tokens are dead after client disable");
        const refreshDead = await tokenPost({
            grant_type: "refresh_token", refresh_token: tokens.refresh_token,
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        });
        ok(refreshDead.status >= 400, "refresh is dead after client disable");
        const authDead = await get(authorizeUrl({ state: "smoke-disabled" }));
        const locD = authDead.headers.get("location") ?? "";
        ok(authDead.status === 400 || locD.includes("error=") || locD.includes("/api/auth/error"),
            "authorize refuses a disabled client", `status ${authDead.status} ${locD.slice(0, 80)}`);
    }

    // 13. Connected-apps surface (oauthGrants): see + revoke the grant.
    {
        const grantsReq = (path, body) =>
            fetch(`${BASE}/api/trpc/${path}`, {
                method: body ? "POST" : "GET",
                headers: { cookie, origin: BASE, "content-type": "application/json" },
                ...(body ? { body: JSON.stringify({ json: body }) } : {}),
            }).then(async (r) => ({ status: r.status, data: (await r.json().catch(() => null))?.result?.data?.json ?? null }));
        // The disable test above turned the client off and wiped its grants —
        // re-enable first, then run a fresh consent+exchange to have a grant.
        await db.update(oauthClient).set({ disabled: false }).where(eq(oauthClient.clientId, CLIENT_ID));
        const code2 = await obtainCode(CLIENT_ID, "smoke-grants");
        if (code2) {
            await tokenPost({
                grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT,
                client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code_verifier: verifier,
            });
        }
        const list = await grantsReq("oauthGrants.list");
        ok(
            list.status === 200 && Array.isArray(list.data) && list.data.some((g) => g.clientId === CLIENT_ID),
            "oauthGrants.list shows the connected app",
            JSON.stringify(list).slice(0, 140),
        );
        const revoke = await grantsReq("oauthGrants.revoke", { clientId: CLIENT_ID });
        ok(revoke.status === 200, "oauthGrants.revoke succeeds");
        const after = await grantsReq("oauthGrants.list");
        ok(!after.data?.some((g) => g.clientId === CLIENT_ID), "grant gone after revoke");
    }

    // 14. Public client (PKCE-only): exchange succeeds WITHOUT a secret;
    //     wrong verifier still fails (PKCE is the whole proof).
    {
        const PUB_ID = `wpcl_smokepub_${Date.now().toString(36)}`;
        await db.insert(oauthClient).values(clientRow(PUB_ID, { secret: null, isPublic: true }));
        try {
            const code = await obtainCode(PUB_ID, "smoke-pub");
            ok(!!code, "public client obtains a code");
            const noSecret = await tokenPost({
                grant_type: "authorization_code", code, redirect_uri: REDIRECT,
                client_id: PUB_ID, code_verifier: verifier,
            });
            ok(noSecret.status === 200 && !!noSecret.body?.access_token, "public client exchanges WITHOUT a secret", JSON.stringify(noSecret.body).slice(0, 100));

            const code2 = await obtainCode(PUB_ID, "smoke-pub-2");
            const badVerifier = await tokenPost({
                grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT,
                client_id: PUB_ID, code_verifier: `${verifier}x`,
            });
            ok(badVerifier.status >= 400, "public client with a wrong verifier refused");
        } finally {
            await db.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, PUB_ID)).catch(() => {});
            await db.delete(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, PUB_ID)).catch(() => {});
            await db.delete(oauthConsent).where(eq(oauthConsent.clientId, PUB_ID)).catch(() => {});
            await db.delete(oauthClient).where(eq(oauthClient.clientId, PUB_ID)).catch(() => {});
        }
    }

    // 15. Rate limit — burst the token endpoint; expect a 429 somewhere.
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
    await db.delete(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, CLIENT_ID)).catch(() => {});
    await db.delete(oauthConsent).where(eq(oauthConsent.clientId, CLIENT_ID)).catch(() => {});
    await db.delete(oauthClient).where(eq(oauthClient.clientId, CLIENT_ID)).catch(() => {});
}

console.log(failures === 0 ? "\nAll OAuth smoke checks passed.\n" : `\n${failures} CHECK(S) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
