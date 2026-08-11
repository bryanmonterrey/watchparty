-- OAuth2/OIDC identity provider ("Sign in with watchparty", 2026-08-11):
-- better-auth oidc-provider plugin tables + jwt plugin signing keys, plus the
-- developer_apps join column. Additive; mirrors db/schema/auth/
-- {oauth-application,oauth-access-token,oauth-consent,jwks}.ts and
-- db/schema/content/developer-app.ts. Apply to BOTH Supabase projects.
--
-- Table/column names are camelCase (quoted) because better-auth's drizzle
-- adapter resolves fields by TS property key — same convention as "twoFactor"
-- and "walletAddress". All four tables are server-only (RLS deny-direct).

create table if not exists "oauthApplication" (
  id text primary key,
  name text not null,
  icon text,
  metadata text,
  "clientId" text not null unique,
  "clientSecret" text,
  "redirectUrls" text not null,
  type text not null,
  disabled boolean not null default false,
  "userId" text references "user"(id) on delete cascade,
  "createdAt" timestamp not null,
  "updatedAt" timestamp not null
);

create index if not exists idx_oauth_application_user on "oauthApplication" ("userId");

alter table "oauthApplication" enable row level security;
drop policy if exists oauth_application_deny_direct_access on "oauthApplication";
create policy oauth_application_deny_direct_access on "oauthApplication"
  for all to authenticated, anon using (false);

create table if not exists "oauthAccessToken" (
  id text primary key,
  "accessToken" text not null unique,
  "refreshToken" text not null unique,
  "accessTokenExpiresAt" timestamp not null,
  "refreshTokenExpiresAt" timestamp not null,
  "clientId" text not null references "oauthApplication"("clientId") on delete cascade,
  "userId" text references "user"(id) on delete cascade,
  scopes text not null,
  "createdAt" timestamp not null,
  "updatedAt" timestamp not null
);

create index if not exists idx_oauth_access_token_client on "oauthAccessToken" ("clientId");
create index if not exists idx_oauth_access_token_user on "oauthAccessToken" ("userId");

alter table "oauthAccessToken" enable row level security;
drop policy if exists oauth_access_token_deny_direct_access on "oauthAccessToken";
create policy oauth_access_token_deny_direct_access on "oauthAccessToken"
  for all to authenticated, anon using (false);

-- NO unique(clientId,userId): the plugin's consent endpoint inserts
-- unconditionally; a uniqueness constraint would 500 every re-consent.
create table if not exists "oauthConsent" (
  id text primary key,
  "clientId" text not null references "oauthApplication"("clientId") on delete cascade,
  "userId" text not null references "user"(id) on delete cascade,
  scopes text not null,
  "consentGiven" boolean not null,
  "createdAt" timestamp not null,
  "updatedAt" timestamp not null
);

create index if not exists idx_oauth_consent_client on "oauthConsent" ("clientId");
create index if not exists idx_oauth_consent_user on "oauthConsent" ("userId");

alter table "oauthConsent" enable row level security;
drop policy if exists oauth_consent_deny_direct_access on "oauthConsent";
create policy oauth_consent_deny_direct_access on "oauthConsent"
  for all to authenticated, anon using (false);

create table if not exists jwks (
  id text primary key,
  "publicKey" text not null,
  "privateKey" text not null,
  "createdAt" timestamp not null,
  "expiresAt" timestamp
);

alter table jwks enable row level security;
drop policy if exists jwks_deny_direct_access on jwks;
create policy jwks_deny_direct_access on jwks
  for all to authenticated, anon using (false);

-- One OAuth client per developer app (nullable until the owner enables OAuth).
alter table developer_apps add column if not exists oauth_client_id text unique;
