# @better-auth/oauth-provider migration — the standing plan

Source-verified delta map (2026-08-12, against the published 1.6.27 tarball).
**This is a re-architecture, not a rename — execute in a dedicated session**,
with `scripts/dev/smoke-oauth-flow.mjs --production` as the exit gate. The
version-geometry blocker is already gone (better-call is a single 1.4.0
tree-wide via overrides).

## Why migrate at all

The deprecated in-tree `oidcProvider` dies at better-auth 1.7. The new plugin
also FIXES, upstream and better, three things we patch locally:
- **Refresh rotation**: atomic CAS revocation + full family invalidation on
  replay (RFC 9700). → delete `lib/auth/oauth-token-rotation.ts`.
- **`disabled` is real revocation** (checked at authorize/token/introspect/
  userinfo). → `revokeOAuthClient`'s delete-all-tokens becomes belt-and-braces.
- **PKCE is structural**: S256-only (plain unrepresentable), required unless a
  client row explicitly opts out; the lying `requirePKCE` option is gone.
Plus RFC 7009 `/oauth2/revoke`, RFC 7662 `/oauth2/introspect`, end-session,
and real discovery docs under `/api/auth/.well-known/*`.

## The five expensive truths

1. **Schema**: `oauthApplication` → new-shape `oauthClient` (arrays are REAL
   `text[]` on pg — comma-joined `redirectUrls` must become `redirectUris
   text[]`; add `scopes text[]`, `public bool` (LOAD-BEARING: secret-less
   clients fail token exchange without it), `requirePKCE`, ~14 more columns;
   our `type: "public"` value → `"native"`/`"user-agent-based"`).
   `oauthAccessToken` reshaped (token/expiresAt renames, sessionId/refreshId
   added, refresh fields dropped). NEW `oauthRefreshToken` table.
   `oauthConsent`: `consentGiven` GONE (row existence = consent; upsert not
   append), scopes → `text[]`.
2. **Tokens truncate**: storage becomes hashed — existing plaintext rows can
   never match. All issued tokens die at cutover (acceptable pre-adoption).
3. **Client secrets**: sealed AES-GCM → hashed. One-off migration script
   (`openSecret` each row → write `sha256` per the plugin's defaultHasher), or
   force-rotate every client. Sealing via `storeClientSecret: {encrypt,decrypt}`
   THROWS at construction with the jwt plugin on.
4. **Consent protocol rewrite**: no `consent_code`, no cookie. consentPage
   receives the whole authorize query HMAC-signed (`sig`, `ba_param`,
   `ba_iat`, `exp`); the card POSTs `{accept, oauth_query}` (via
   `buildSignedOAuthQuery(window.location.search)`); response is
   `{redirect, url}` not `{redirectURI}`. The `/login?callbackUrl=` fallback
   must preserve EVERY query param or the signature breaks.
   `oauthProviderClient()` MUST be registered in `lib/auth/client.ts` or
   login-resume silently dies (it auto-attaches `oauth_query` to sign-ins).
5. **The register hole MOVED**: `/oauth2/register` now 403s properly, but
   `/oauth2/create-client|update-client|delete-client|client/rotate-secret`
   are plain session-gated and bypass our tRPC ownership/cap/redirect policy.
   404 that set in middleware (and/or `clientPrivileges` allowing only
   read/list), exactly like the old register-404.

## Option mapping (code-read defaults, not JSDoc)

KEEP: `loginPage`, `consentPage` (new contract), `allowDynamicClientRegistration:false`,
`scopes` (must include `openid`), `accessTokenExpiresIn`.
DELETE: `__skipDeprecationWarning`, `requirePKCE`, `allowPlainCodeChallengeMethod`,
`useJWTPlugin` (inverted: `disableJwtPlugin` default false — keep `jwt()` registered).
REWRITE: `storeClientSecret` → `"hashed"`; `getAdditionalUserInfoClaim` →
`customUserInfoClaims` + `customIdTokenClaims` (scope-filter guard no longer
needed — the unconditional-merge bug is fixed).
ADD: `generateClientId` (keep `wpcl_…`), `prefix.*` (set BEFORE first deploy),
`silenceWarnings.{oauthAuthServerConfig,openidConfig}`, `schema` model/field
overrides, adapter map + `oauthRefreshToken`.

## Touchpoint verdicts

| file | verdict |
|---|---|
| `lib/auth/server.ts` plugin block | REWRITE per mapping above |
| `lib/auth/oauth-token-rotation.ts` | DELETE (fixed upstream, atomically) |
| `lib/auth/client.ts` | ADD `oauthProviderClient()` |
| `middleware.ts` register-404 | RETARGET to the create/update/delete/rotate-secret set; extend IP limits to introspect/revoke/continue/end-session |
| `developerApps` insert/rotate/revoke | REWRITE (text[] fields, `public` flag, hashed secret; keep direct inserts — that's how `wpcl_` ids + caps + redirect policy survive) |
| `oauthGrants` | small REWRITE (`consentGiven` filter gone, scopes text[], dedupe dead, revoke also deletes `oauthRefreshToken`) |
| consent page + card | REWRITE (signed-query contract) |
| `login-card.tsx` guard | KEEP (tighten to `params.has("sig")`) |
| smoke | REWRITE: consent contract, `{redirect,url}`, family-invalidation assertion, RFC 7009/7662 cases, create-client blocked |

## Order of execution (fresh session)

worktree: bun add + config rewrite + tsc → DDL (additive new tables, both DBs)
→ secret rehash script → touchpoint rewrites → full smoke locally → cutover
commit → prod smoke. Tokens truncate at cutover by design.
