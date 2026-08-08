#!/usr/bin/env node
/**
 * Mint a real signed session cookie for a test user, so automated browser
 * checks can drive the signed-in app.
 *
 * The whole reason this exists: every browser-level bug this codebase has
 * shipped (empty assistant replies, most recently) was invisible to tsc and to
 * CI, and the only thing that would have caught it is loading the real page as
 * a logged-in user. Doing that by hand — email, OTP, wallet popups — is the
 * "pitstop" that made it not happen.
 *
 * REFUSES TO RUN AGAINST PRODUCTION. It resolves the DB the same way the app
 * does (.env.local overrides .env), then hard-checks the host against the known
 * prod Supabase ref before it touches anything.
 *
 *   bun scripts/dev/mint-test-session.mjs                      # default test user
 *   bun scripts/dev/mint-test-session.mjs --email you@x.com    # an existing user
 *   bun scripts/dev/mint-test-session.mjs --json               # machine-readable
 *
 * Output is a Cookie header value. Hand it to puppeteer/curl:
 *   curl -H "cookie: $(bun scripts/dev/mint-test-session.mjs --raw)" localhost:3001/api/...
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i > -1 ? (args[i + 1]?.startsWith("--") ? true : args[i + 1]) : d; };
const has = (n) => args.includes(`--${n}`);

// ── env, resolved the way the app resolves it ────────────────────────────────
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
const env = { ...readEnv(".env"), ...readEnv(".env.local") };
const dbUrl = env.DATABASE_URL ?? env.DIRECT_URL ?? process.env.DATABASE_URL;
const secret = env.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;

if (!dbUrl) { console.error("no DATABASE_URL in .env.local/.env"); process.exit(1); }
if (!secret) { console.error("no BETTER_AUTH_SECRET — cookies must be signed with it"); process.exit(1); }

// ── the guard ────────────────────────────────────────────────────────────────
// The dev/prod split (CLAUDE.md, 2026-08-07) exists because a mis-targeted
// tool already dropped tables in prod once. A script that mints LOGIN COOKIES
// must never be the second time.
//
// Prod is DERIVED, not hardcoded: `.env` is the production config and
// `.env.local` is the dev override, so "the ref in .env" is prod by definition
// and this can't rot when a project is rotated. A hardcoded ref that stops
// matching is a guard that silently passes.
const refOf = (url) => url?.match(/postgres\.([a-z0-9]{16,})/)?.[1] ?? null;
const prodRef = refOf(readEnv(".env").DATABASE_URL ?? readEnv(".env").DIRECT_URL);
const activeRef = refOf(dbUrl);
const mask = (r) => (r ? `${r.slice(0, 4)}…${r.slice(-3)}` : "unknown");

if (!activeRef) {
    console.error("\nREFUSING: couldn't identify the Supabase project from DATABASE_URL.");
    console.error("The prod guard can't verify the target, so it won't proceed.\n");
    process.exit(1);
}
if (prodRef && activeRef === prodRef) {
    console.error(`\nREFUSING: DATABASE_URL is the PRODUCTION project (${mask(activeRef)}).`);
    console.error("Point .env.local at the dev Supabase project first.\n");
    process.exit(1);
}
if (!has("json") && !has("raw")) console.log(`\ndb project: ${mask(activeRef)} (prod is ${mask(prodRef)} — not this)`);

// ── mint ─────────────────────────────────────────────────────────────────────
const email = flag("email", "e2e-test@watchparty.local");

const { auth } = await import("../../lib/auth/server.ts");
const ctx = await auth.$context;

let user = await ctx.internalAdapter.findUserByEmail(email).catch(() => null);
user = user?.user ?? user;

if (!user) {
    if (flag("email")) { console.error(`no user with email ${email}`); process.exit(1); }
    // Only ever auto-create the dedicated test identity, never an arbitrary one.
    user = await ctx.internalAdapter.createUser({
        email,
        name: "e2e test",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    if (!has("json") && !has("raw")) console.log(`created test user ${email}`);
}

// A user with no handle gets the "WELCOME TO WATCHPARTY — Claim your handle"
// onboarding dialog, whose Radix overlay swallows every click on the page.
// That is correct app behaviour and it silently broke the browser smoke test:
// the assistant button was found, visible and unblocked by its own styles, but
// elementFromPoint resolved to the overlay. Give the fixture a handle so the
// test exercises the app rather than onboarding.
if (!user.username) {
    await ctx.internalAdapter.updateUser(user.id, {
        username: `e2etest`,
        displayUsername: `e2etest`,
    }).catch(() => { /* column may not exist in every environment */ });
    if (!has("json") && !has("raw")) console.log("set handle @e2etest (skips the onboarding dialog)");
}

const session = await ctx.internalAdapter.createSession(user.id, undefined, false);
if (!session?.token) { console.error("createSession returned no token"); process.exit(1); }

// better-auth signs the cookie value as `${token}.${base64url(hmac)}`. Rebuilt
// here rather than imported because the signing helper isn't a public export.
const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
);
const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(session.token));
// STANDARD base64, WITH padding. better-call rejects anything else outright:
//   if (signature.length !== 44 || !signature.endsWith("=")) return null;
// (node_modules/better-call/dist/context.mjs). Note this differs from the
// session-DATA cache cookie, which better-auth signs as base64urlnopad — using
// that encoding here yields a cookie that is silently ignored, which is exactly
// how the first version of this script produced a token the server rejected
// while the session sat valid in Redis.
const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
// useSecureCookies is false outside production, so no __Secure- prefix here.
const cookie = `better-auth.session_token=${session.token}.${signature}`;

if (has("json")) {
    console.log(JSON.stringify({ cookie, token: session.token, userId: user.id, email, expiresAt: session.expiresAt }));
} else if (has("raw")) {
    process.stdout.write(cookie);
} else {
    console.log(`user:    ${email}  (${user.id})`);
    console.log(`expires: ${session.expiresAt}`);
    console.log(`\ncookie:\n${cookie}\n`);
}
process.exit(0);
