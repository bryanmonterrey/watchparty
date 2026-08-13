// OAuth2/OIDC consent scopes for "Sign in with watchparty" — a PURE module
// (no server imports; ships to the consent screen and is vendored into the
// console). These are user-consent-legible grants, deliberately DISTINCT from
// lib/api-pricing.ts's scope families, which are billing buckets keyed off
// paths, not things a person can meaningfully approve.
//
// v1 is the standard OIDC set only: userinfo is the sole resource endpoint an
// access token can hit today, so inventing `read:*` scopes with nothing
// honoring them would put dead toggles on the consent screen. Grow this list
// only together with the endpoint that enforces the new scope.
//
// Vendored copy: console/lib/oauth-scopes.ts, drift-guarded by
// tests/console-oauth-scopes.test.ts (same pattern as bot-permissions).

export const OAUTH_SCOPES = [
    {
        scope: "openid",
        label: "Verify your identity",
        desc: "Confirm who you are on watchparty (required for sign-in)",
    },
    {
        scope: "profile",
        label: "Read your public profile",
        desc: "Your display name, username and avatar",
    },
    {
        scope: "email",
        label: "See your email address",
        desc: "The email on your watchparty account",
    },
    {
        scope: "offline_access",
        label: "Stay connected",
        desc: "Keep access without asking you to sign in again",
    },
] as const;

export type OAuthScope = (typeof OAUTH_SCOPES)[number]["scope"];

// ── Privileged scopes ───────────────────────────────────────────────────────
// Scopes that require ADMIN REVIEW before an app may be granted them (Phase 11
// "human review for privileged scopes"). The review queue, the fail-closed gate
// (an app only gets a privileged scope after approval, added to its oauthClient
// allow-list) and the admin surface are all live — but this set is INTENTIONALLY
// EMPTY today, so nothing is gated yet.
//
// To add one, and ONLY together with a real endpoint that ENFORCES it (the house
// rule — never a scope the consent screen shows but nothing honors):
//   1. add the { scope, label, desc } entry to OAUTH_SCOPES above,
//   2. add its id to PRIVILEGED_SCOPE_IDS here,
//   3. ship the endpoint that checks it.
// The console will then offer it as a "request access" scope, gated by review.
export const PRIVILEGED_SCOPE_IDS: string[] = [];

/** Does this scope require admin review before an app may use it? */
export function isPrivilegedScope(scope: string): boolean {
    return PRIVILEGED_SCOPE_IDS.includes(scope);
}

// The provider's GLOBAL scope list (opts.scopes in lib/auth/server.ts) — the
// scopes a default client (client.scopes = null) may request self-serve.
// PRIVILEGED scopes are EXCLUDED here on purpose: that's the gate. A privileged
// scope is only reachable by a client whose explicit `scopes` allow-list
// includes it, which admin approval writes (server/routers/admin.ts). Empty
// PRIVILEGED_SCOPE_IDS today ⇒ this is every scope, unchanged.
export const OAUTH_SCOPE_IDS: string[] = OAUTH_SCOPES
    .map((s) => s.scope)
    .filter((s) => !isPrivilegedScope(s));

/** Every scope id in the catalog, privileged included — used to build a
 *  client's allow-list when a privileged scope is granted (standard scopes +
 *  the approved privileged ones). */
export const ALL_OAUTH_SCOPE_IDS: string[] = OAUTH_SCOPES.map((s) => s.scope);

export function isKnownScope(scope: string): scope is OAuthScope {
    return ALL_OAUTH_SCOPE_IDS.includes(scope);
}

/** Resolve a space- or array-form scope request to catalog entries, unknown scopes dropped. */
export function describeScopes(scopes: string | string[]): (typeof OAUTH_SCOPES)[number][] {
    const list = Array.isArray(scopes) ? scopes : scopes.split(/[\s,]+/).filter(Boolean);
    return OAUTH_SCOPES.filter((s) => list.includes(s.scope));
}
