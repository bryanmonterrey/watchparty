// VENDORED copy of the OAuth consent scope catalog from the main app's
// lib/developer/oauth-scopes.ts (the bundler must not import across the app
// boundary — see console/lib/webhook-events.ts). Guarded against drift by
// tests/console-oauth-scopes.test.ts, which deep-compares it to the source
// and gates deploy.

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

export const OAUTH_SCOPE_IDS: string[] = OAUTH_SCOPES.map((s) => s.scope);
