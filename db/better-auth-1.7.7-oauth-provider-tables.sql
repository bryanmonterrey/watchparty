-- @better-auth/oauth-provider 1.7.1 -> 1.7.7 (2026-10-01): three new models —
-- oauthResource (RFC 8707 resource indicators), oauthClientResource (the
-- client/resource join, only enforced with enforcePerClientResources) and
-- oauthClientAssertion (JWT client-assertion replay guard). The adapter logs
-- "Drizzle schema mismatch / Missing tables" on every request until they
-- exist. Nothing of ours writes them yet; they are empty tables with the same
-- deny-direct-access RLS as the other oauth* tables. Additive; safe while
-- 1.7.1 is deployed. Run against production before the 1.7.7 deploy so
-- scripts/db/check-drift.ts stays green:
--
--   node scripts/db/apply-sql.mjs db/better-auth-1.7.7-oauth-provider-tables.sql prod

CREATE TABLE IF NOT EXISTS "oauthResource" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "accessTokenTtl" integer,
  "refreshTokenTtl" integer,
  "signingAlgorithm" text,
  "signingKeyId" text,
  "allowedScopes" text[],
  "customClaims" jsonb,
  "dpopBoundAccessTokensRequired" boolean DEFAULT false,
  "disabled" boolean DEFAULT false,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "policyVersion" integer DEFAULT 1,
  "metadata" jsonb
);
ALTER TABLE "oauthResource" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oauth_resource_deny_direct_access" ON "oauthResource";
CREATE POLICY "oauth_resource_deny_direct_access" ON "oauthResource" FOR ALL TO authenticated, anon USING (false);

CREATE TABLE IF NOT EXISTS "oauthClientResource" (
  "id" text PRIMARY KEY,
  "clientId" text NOT NULL REFERENCES "oauthClient"("clientId") ON DELETE CASCADE,
  "resourceId" text NOT NULL REFERENCES "oauthResource"("identifier") ON DELETE CASCADE,
  "metadata" jsonb,
  "createdAt" timestamp
);
CREATE INDEX IF NOT EXISTS "idx_oauth_client_resource_client" ON "oauthClientResource" ("clientId");
CREATE INDEX IF NOT EXISTS "idx_oauth_client_resource_resource" ON "oauthClientResource" ("resourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_oauth_client_resource_pair" ON "oauthClientResource" ("clientId", "resourceId");
ALTER TABLE "oauthClientResource" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oauth_client_resource_deny_direct_access" ON "oauthClientResource";
CREATE POLICY "oauth_client_resource_deny_direct_access" ON "oauthClientResource" FOR ALL TO authenticated, anon USING (false);

CREATE TABLE IF NOT EXISTS "oauthClientAssertion" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamp NOT NULL
);
ALTER TABLE "oauthClientAssertion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oauth_client_assertion_deny_direct_access" ON "oauthClientAssertion";
CREATE POLICY "oauth_client_assertion_deny_direct_access" ON "oauthClientAssertion" FOR ALL TO authenticated, anon USING (false);
