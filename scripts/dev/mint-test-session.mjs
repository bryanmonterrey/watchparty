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
// `.env.local` normally overrides `.env` (dev DB wins), exactly like the app.
// With --yes-production we deliberately read `.env` alone, which IS the
// production config — otherwise the flag would be meaningless, since the local
// override would keep pointing at dev.
const env = has("yes-production")
    ? readEnv(".env")
    : { ...readEnv(".env"), ...readEnv(".env.local") };
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
// Production requires an explicit, typed-out opt-in. Even then it will ONLY
// ever create/sign-in the dedicated e2e identity — never a real account.
//
// This exists so nobody is ever asked to hand over their own session cookie to
// debug prod. A cookie for a real account is a full login: replayable by
// anyone who sees it, permanent in a chat log, and revocable only by nuking
// your own sessions. A throwaway identity with no wallet, no funds and no
// premium has almost no blast radius, and you can delete the row afterwards.
const PROD_OPT_IN = "--yes-production";
if (prodRef && activeRef === prodRef) {
    if (!has("yes-production")) {
        console.error(`\nREFUSING: DATABASE_URL is the PRODUCTION project (${mask(activeRef)}).`);
        console.error(`\nIf that's deliberate, re-run with ${PROD_OPT_IN}. It will only ever`);
        console.error("create/sign in the dedicated e2e test identity, never a real user.\n");
        process.exit(1);
    }
    if (flag("email")) {
        console.error("\nREFUSING: --email is not allowed against production.");
        console.error("Prod may only mint the dedicated e2e identity.\n");
        process.exit(1);
    }
    if (!has("json") && !has("raw")) console.error(`\n!! PRODUCTION (${mask(activeRef)}) — e2e identity only\n`);
}
if (!has("json") && !has("raw")) console.log(`\ndb project: ${mask(activeRef)} (prod is ${mask(prodRef)} — not this)`);

// ── mint ─────────────────────────────────────────────────────────────────────
const email = flag("email", "e2e-test@watchparty.local");

// The auth instance reads process.env, not our parsed copy — so when we've
// deliberately selected a different target above, push it in before importing.
for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v;

const { auth } = await import("../../lib/auth/server.ts");
const ctx = await auth.$context;

let user = await ctx.internalAdapter.findUserByEmail(email).catch(() => null);
user = user?.user ?? user;

// Dedicated test identities only — `e2e-test@` and `e2e-test-N@`. Multi-user
// flows (two people in one channel) need more than one fixture, but the guard
// that matters is unchanged: an arbitrary email is still never auto-created.
const FIXTURE_EMAIL = /^e2e-test(-\d+)?@watchparty\.local$/;

if (!user) {
    if (!FIXTURE_EMAIL.test(email)) { console.error(`no user with email ${email}`); process.exit(1); }
    const suffix = email.match(/^e2e-test-(\d+)@/)?.[1];
    user = await ctx.internalAdapter.createUser({
        email,
        name: suffix ? `e2e test ${suffix}` : "e2e test",
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
    // Derived from the fixture number — `username` is unique, so a hardcoded
    // handle makes the SECOND fixture collide and silently keep no handle,
    // which puts it straight back into the onboarding dialog this exists to
    // avoid.
    const handle = `e2etest${email.match(/^e2e-test-(\d+)@/)?.[1] ?? ""}`;
    await ctx.internalAdapter.updateUser(user.id, {
        username: handle,
        displayUsername: handle,
    }).catch(() => { /* column may not exist in every environment */ });
    if (!has("json") && !has("raw")) console.log(`set handle @${handle} (skips the onboarding dialog)`);
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
// COOKIE NAME DEPENDS ON THE TARGET. lib/auth/server.ts sets
// `useSecureCookies: process.env.NODE_ENV === "production"`, and better-auth
// prefixes secure cookies with `__Secure-`. Minting for prod with the dev name
// produces a cookie the server silently ignores — it looks exactly like a
// rejected login.
const cookieName = has("yes-production")
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
const cookie = `${cookieName}=${session.token}.${signature}`;

if (has("json")) {
    console.log(JSON.stringify({ cookie, cookieName, token: session.token, userId: user.id, email, expiresAt: session.expiresAt }));
} else if (has("raw")) {
    process.stdout.write(cookie);
} else {
    console.log(`user:    ${email}  (${user.id})`);
    console.log(`expires: ${session.expiresAt}`);
    console.log(`\ncookie:\n${cookie}\n`);
}
process.exit(0);
