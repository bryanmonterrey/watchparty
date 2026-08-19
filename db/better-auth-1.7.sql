-- better-auth 1.7 account-identity migration.
--
-- 1.7 keys accounts on (issuer, accountId) instead of accountId alone, and adds
-- a required `issuer` column plus a UNIQUE index over the pair. Every existing
-- row predates the column, so it has to be backfilled before the index goes on
-- or the NOT NULL/unique constraints fail.
--
-- The issuer value is NOT free-form — better-auth derives it, and a login only
-- finds an existing account when the stored value matches byte for byte:
--   * OAuth providers that declare their own issuer  -> that issuer URL
--     (of the five we run, ONLY google declares one: https://accounts.google.com)
--   * every other OAuth provider  -> `local:oauth:<encodeURIComponent(providerId)>`
--   * local methods (siws, siwe, credential)  -> `local:<encodeURIComponent(providerId)>`
-- Source: createOAuthAccountIssuer / createLocalAccountIssuer in
-- @better-auth/core/dist/db/schema/account.mjs, and accountIssuer in
-- @better-auth/core/dist/social-providers/<provider>.mjs.
--
-- Measured before writing (33 account rows): siws 14, google 7, kick 3, siwe 3,
-- twitter 3, twitch 2, discord 1 — and ZERO duplicate (providerId, accountId)
-- pairs, so the unique index applies cleanly. Re-check on the second database
-- before running: a provider present there and not here has no mapping below and
-- would be left NULL, which the NOT NULL step would then reject.
--
-- APPLY TO BOTH PROJECTS (dev + prod). Additive and reversible up to the final
-- NOT NULL: drop the index and the column to undo.

BEGIN;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text;

UPDATE "account" SET "issuer" =
  CASE "providerId"
    WHEN 'google' THEN 'https://accounts.google.com'
    WHEN 'twitter' THEN 'local:oauth:twitter'
    WHEN 'twitch'  THEN 'local:oauth:twitch'
    WHEN 'kick'    THEN 'local:oauth:kick'
    WHEN 'discord' THEN 'local:oauth:discord'
    WHEN 'siws'    THEN 'local:siws'
    WHEN 'siwe'    THEN 'local:siwe'
    WHEN 'credential' THEN 'local:credential'
  END
WHERE "issuer" IS NULL;

-- Fail loudly rather than silently leaving an account that can never log in.
DO $$
DECLARE unmapped text;
BEGIN
  SELECT string_agg(DISTINCT "providerId", ', ') INTO unmapped
  FROM "account" WHERE "issuer" IS NULL;
  IF unmapped IS NOT NULL THEN
    RAISE EXCEPTION 'unmapped providerId(s): % — add them to the CASE above', unmapped;
  END IF;
END $$;

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_unique"
  ON "account" ("issuer", "accountId");

-- @better-auth/oauth-provider 1.7 client-registration fields. Both nullable;
-- the one existing oauthClient row needs no value.
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "applicationType" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "clientDiscoveryId" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "clientCredentialsScopes" text;

COMMIT;
