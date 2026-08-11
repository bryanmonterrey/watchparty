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

/** The plain scope ids, in catalog order — what the provider config accepts. */
export const OAUTH_SCOPE_IDS: string[] = OAUTH_SCOPES.map((s) => s.scope);

export function isKnownScope(scope: string): scope is OAuthScope {
    return OAUTH_SCOPE_IDS.includes(scope);
}

/** Resolve a space- or array-form scope request to catalog entries, unknown scopes dropped. */
export function describeScopes(scopes: string | string[]): (typeof OAUTH_SCOPES)[number][] {
    const list = Array.isArray(scopes) ? scopes : scopes.split(/[\s,]+/).filter(Boolean);
    return OAUTH_SCOPES.filter((s) => list.includes(s.scope));
}
