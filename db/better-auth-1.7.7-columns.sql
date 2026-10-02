-- better-auth 1.7.1 -> 1.7.7 (2026-10-02): the columns 1.7.7 and its plugins
-- write, and the one constraint it can no longer satisfy.
--
-- 1.7.7's drizzle adapter compares the schema against what its plugins expect
-- and THROWS on every request when anything is missing. That took sign-in down
-- for an hour on 2026-10-02 (build, tests and tsc were all green). The list
-- below is the adapter's own, captured from the repro in
-- docs/better-auth-1.7.7-migration.md.
--
-- SAFE TO RUN WHILE 1.7.1 IS STILL DEPLOYED — that is the point. Every column
-- is nullable or defaulted and 1.7.1 neither reads nor writes any of them, so
-- the database goes ahead of the code and the bump lands on a database that
-- already has everything.
--
-- Three things here are NOT plain additive columns:
--
-- 1. oauthClient."clientCredentialsScopes" ALREADY EXISTS, as `text`
--    (db/better-auth-1.7-phase1-expand.sql added it for 1.7.0). 1.7.7 declares
--    it `string[]`. ADD COLUMN IF NOT EXISTS would skip it silently and
--    check-drift.ts only checks that a column exists, not its type, so nothing
--    would flag it until a client registered with scopes. Converted in place;
--    measured NULL on the single production client row before writing.
--
-- 2. account."issuer" loses NOT NULL. 1.7.0–1.7.2 keyed accounts on
--    (issuer, accountId); 1.7.3+ went back to (providerId, accountId) and no
--    longer writes the column, so with NOT NULL every new account insert fails.
--
-- 3. ...and a trigger keeps filling it. Without one, the documented rollback
--    ("pin back to 1.7.1") is NOT safe: every account created while 1.7.7 was
--    live would have a NULL issuer, 1.7.1 looks accounts up by issuer, finds
--    nothing, and mints a DUPLICATE USER on that person's next sign-in — no
--    error anywhere. The trigger derives the value exactly as 1.7.1 would have
--    (same CASE as phase 1/2), so rows written by either version are findable
--    by both. Unknown providers are left NULL rather than guessed.
--    Drop the trigger, the index and the column together once 1.7.1 is no
--    longer a rollback target.
--
-- Measured on production before writing: 51 account rows, zero NULL issuers,
-- zero duplicate (providerId, accountId) pairs (1.7.7 throws on a duplicate),
-- 1 oauthClient, 1 jwks key, no tokens/consents/twoFactor rows.

BEGIN;

-- twoFactor: the lock set once failedVerificationCount trips.
ALTER TABLE "twoFactor" ADD COLUMN IF NOT EXISTS "lockedUntil" timestamp;

-- jwks: per-key algorithm and curve. NULL on the existing key = the plugin's
-- configured default (EdDSA), which is what it was minted with.
ALTER TABLE "jwks" ADD COLUMN IF NOT EXISTS "alg" text;
ALTER TABLE "jwks" ADD COLUMN IF NOT EXISTS "crv" text;

-- oauthClient ("clientDiscoveryId" and "applicationType" exist since phase 1;
-- listed anyway so this file is complete against a database that skipped it).
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "clientDiscoveryId" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "applicationType" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "clientCredentialsScopes" text[];
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "backchannelLogoutUri" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "backchannelLogoutSessionRequired" boolean;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "jwks" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "jwksUri" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "dpopBoundAccessTokens" boolean DEFAULT false;

-- (1) text -> text[]. Guarded so a re-run, or a database where the column was
-- created as text[] just above, is a no-op.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'oauthClient'
        AND column_name = 'clientCredentialsScopes') = 'text' THEN
    ALTER TABLE "oauthClient" ALTER COLUMN "clientCredentialsScopes" TYPE text[]
      USING CASE
        WHEN "clientCredentialsScopes" IS NULL OR btrim("clientCredentialsScopes") = '' THEN NULL
        ELSE regexp_split_to_array(btrim("clientCredentialsScopes"), '\s+')
      END;
  END IF;
END $$;

-- oauthRefreshToken
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "authorizationCodeId" text;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "resources" text[];
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "requestedUserInfoClaims" text[];
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "rotatedAt" timestamp;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "rotationReplayResponse" text;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "rotationReplayExpiresAt" timestamp;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "confirmation" jsonb;
CREATE INDEX IF NOT EXISTS "idx_oauth_refresh_token_auth_code"
  ON "oauthRefreshToken" ("authorizationCodeId");

-- oauthAccessToken
ALTER TABLE "oauthAccessToken" ADD COLUMN IF NOT EXISTS "authorizationCodeId" text;
ALTER TABLE "oauthAccessToken" ADD COLUMN IF NOT EXISTS "resources" text[];
ALTER TABLE "oauthAccessToken" ADD COLUMN IF NOT EXISTS "requestedUserInfoClaims" text[];
ALTER TABLE "oauthAccessToken" ADD COLUMN IF NOT EXISTS "revoked" timestamp;
ALTER TABLE "oauthAccessToken" ADD COLUMN IF NOT EXISTS "confirmation" jsonb;
CREATE INDEX IF NOT EXISTS "idx_oauth_access_token_auth_code"
  ON "oauthAccessToken" ("authorizationCodeId");

-- oauthConsent
ALTER TABLE "oauthConsent" ADD COLUMN IF NOT EXISTS "resources" text[];
ALTER TABLE "oauthConsent" ADD COLUMN IF NOT EXISTS "requestedUserInfoClaims" text[];

-- (2) 1.7.7 never writes issuer.
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;

-- (3) Keep it populated so a rollback to 1.7.1 still finds every account.
-- search_path is pinned because Supabase's advisor flags mutable ones.
CREATE OR REPLACE FUNCTION public.account_fill_issuer() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."issuer" IS NULL THEN
    NEW."issuer" := CASE NEW."providerId"
      WHEN 'google'     THEN 'https://accounts.google.com'
      WHEN 'twitter'    THEN 'local:oauth:twitter'
      WHEN 'twitch'     THEN 'local:oauth:twitch'
      WHEN 'kick'       THEN 'local:oauth:kick'
      WHEN 'discord'    THEN 'local:oauth:discord'
      WHEN 'siws'       THEN 'local:siws'
      WHEN 'siwe'       THEN 'local:siwe'
      WHEN 'credential' THEN 'local:credential'
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "account_fill_issuer" ON "account";
CREATE TRIGGER "account_fill_issuer"
  BEFORE INSERT ON "account"
  FOR EACH ROW EXECUTE FUNCTION public.account_fill_issuer();

COMMIT;
