-- @better-auth/oauth-provider migration (2026-08-12): replaces the deprecated
-- oidc-provider plugin's tables with the new plugin's shapes. Mirrors
-- db/schema/auth/{oauth-client,oauth-refresh-token,oauth-access-token,
-- oauth-consent}.ts. Apply to BOTH Supabase projects, BEFORE deploying the
-- code and BEFORE scripts/db/migrate-oauth-clients.mjs (which copies client +
-- consent rows across).
--
-- Naming collisions are handled by RENAME, not DROP:
--   "oauthAccessToken" (old shape)  -> "oauthAccessToken_legacy", TRUNCATED —
--       its rows are PLAINTEXT opaque tokens that die at cutover by design;
--       keeping the empty table preserves a rename-back rollback.
--   "oauthConsent" (old shape)      -> "oauthConsent_legacy", rows KEPT —
--       the migration script copies them into the new upsert-shaped table.
--   "oauthApplication" keeps its name (no collision) and becomes the legacy
--       client registry; the migration script unseals each clientSecret and
--       writes the sha256 hash into the new "oauthClient".
-- Postgres renames indexes with neither table nor policy, so legacy indexes
-- are renamed explicitly — otherwise the new tables' CREATE INDEX IF NOT
-- EXISTS would silently no-op against the legacy index of the same name.
--
-- All camelCase names quoted (better-auth's drizzle adapter resolves fields
-- by TS property key; same convention as the rest of db/schema/auth).

-- 1. Park the old-shape token table (detected by a column only it has).
do $$
begin
  if exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'oauthAccessToken' and column_name = 'refreshToken'
  ) then
    alter table "oauthAccessToken" rename to "oauthAccessToken_legacy";
    truncate "oauthAccessToken_legacy";
    alter index if exists idx_oauth_access_token_client rename to idx_oauth_access_token_client_legacy;
    alter index if exists idx_oauth_access_token_user rename to idx_oauth_access_token_user_legacy;
  end if;
end $$;

-- 2. Park the old-shape consent table (rows kept for the migration script).
do $$
begin
  if exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'oauthConsent' and column_name = 'consentGiven'
  ) then
    alter table "oauthConsent" rename to "oauthConsent_legacy";
    alter index if exists idx_oauth_consent_client rename to idx_oauth_consent_client_legacy;
    alter index if exists idx_oauth_consent_user rename to idx_oauth_consent_user_legacy;
  end if;
end $$;

-- 3. The new client registry.
create table if not exists "oauthClient" (
  id text primary key,
  "clientId" text not null unique,
  "clientSecret" text,
  disabled boolean default false,
  "skipConsent" boolean,
  "enableEndSession" boolean,
  "subjectType" text,
  scopes text[],
  "userId" text references "user"(id) on delete cascade,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  name text,
  uri text,
  icon text,
  contacts text[],
  tos text,
  policy text,
  "softwareId" text,
  "softwareVersion" text,
  "softwareStatement" text,
  "redirectUris" text[] not null,
  "postLogoutRedirectUris" text[],
  "tokenEndpointAuthMethod" text,
  "grantTypes" text[],
  "responseTypes" text[],
  public boolean,
  type text,
  "requirePKCE" boolean,
  "referenceId" text,
  metadata jsonb
);

create index if not exists idx_oauth_client_user on "oauthClient" ("userId");

alter table "oauthClient" enable row level security;
drop policy if exists oauth_client_deny_direct_access on "oauthClient";
create policy oauth_client_deny_direct_access on "oauthClient"
  for all to authenticated, anon using (false);

-- 4. Refresh tokens (hashed at rest; `revoked` powers atomic rotation +
--    family invalidation upstream).
create table if not exists "oauthRefreshToken" (
  id text primary key,
  token text not null unique,
  "clientId" text not null references "oauthClient"("clientId") on delete cascade,
  "sessionId" text references "session"(id) on delete set null,
  "userId" text not null references "user"(id) on delete cascade,
  "referenceId" text,
  "expiresAt" timestamp,
  "createdAt" timestamp,
  revoked timestamp,
  "authTime" timestamp,
  scopes text[] not null
);

create index if not exists idx_oauth_refresh_token_client on "oauthRefreshToken" ("clientId");
create index if not exists idx_oauth_refresh_token_session on "oauthRefreshToken" ("sessionId");
create index if not exists idx_oauth_refresh_token_user on "oauthRefreshToken" ("userId");

alter table "oauthRefreshToken" enable row level security;
drop policy if exists oauth_refresh_token_deny_direct_access on "oauthRefreshToken";
create policy oauth_refresh_token_deny_direct_access on "oauthRefreshToken"
  for all to authenticated, anon using (false);

-- 5. Access tokens, new shape (hashed `token`, linked to session + refresh).
create table if not exists "oauthAccessToken" (
  id text primary key,
  token text unique,
  "clientId" text not null references "oauthClient"("clientId") on delete cascade,
  "sessionId" text references "session"(id) on delete set null,
  "userId" text references "user"(id) on delete cascade,
  "referenceId" text,
  "refreshId" text references "oauthRefreshToken"(id) on delete cascade,
  "expiresAt" timestamp,
  "createdAt" timestamp,
  scopes text[] not null
);

create index if not exists idx_oauth_access_token_client on "oauthAccessToken" ("clientId");
create index if not exists idx_oauth_access_token_session on "oauthAccessToken" ("sessionId");
create index if not exists idx_oauth_access_token_user on "oauthAccessToken" ("userId");
create index if not exists idx_oauth_access_token_refresh on "oauthAccessToken" ("refreshId");

alter table "oauthAccessToken" enable row level security;
drop policy if exists oauth_access_token_deny_direct_access on "oauthAccessToken";
create policy oauth_access_token_deny_direct_access on "oauthAccessToken"
  for all to authenticated, anon using (false);

-- 6. Consents, new shape: row existence IS the consent (no consentGiven),
--    UPSERTED by the plugin — the partial unique index makes one-row-per-
--    (client,user) real. referenceId-scoped consents (org/team) are distinct
--    by design; we never write them today.
create table if not exists "oauthConsent" (
  id text primary key,
  "clientId" text not null references "oauthClient"("clientId") on delete cascade,
  "userId" text references "user"(id) on delete cascade,
  "referenceId" text,
  scopes text[] not null,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

create index if not exists idx_oauth_consent_client on "oauthConsent" ("clientId");
create index if not exists idx_oauth_consent_user on "oauthConsent" ("userId");
create unique index if not exists uq_oauth_consent_client_user
  on "oauthConsent" ("clientId", "userId") where "referenceId" is null;

alter table "oauthConsent" enable row level security;
drop policy if exists oauth_consent_deny_direct_access on "oauthConsent";
create policy oauth_consent_deny_direct_access on "oauthConsent"
  for all to authenticated, anon using (false);
