-- better-auth 1.7 account-identity migration, PHASE 1 of 2 (expand).
--
-- SAFE TO RUN WHILE 1.6.27 IS STILL DEPLOYED. That is the whole reason this is
-- split: 1.6 does not supply `issuer` when it inserts an account row, so making
-- the column NOT NULL before the 1.7 deploy would fail every NEW signup
-- (existing users would keep signing in, so it would look fine right up until
-- someone tried to register). NOT NULL lives in phase 2, after the deploy.
--
-- 1.7 keys accounts on (issuer, accountId) rather than accountId alone. The
-- issuer value is NOT free-form — better-auth derives it, and a login only
-- matches an existing account when the stored value is identical:
--   * an OAuth provider that declares its own issuer -> that issuer
--     (of the five we run, ONLY google declares one)
--   * any other OAuth provider -> `local:oauth:<encodeURIComponent(providerId)>`
--   * local methods (siws, siwe, credential) -> `local:<encodeURIComponent(providerId)>`
-- Source: createOAuthAccountIssuer / createLocalAccountIssuer in
-- @better-auth/core/dist/db/schema/account.mjs, and accountIssuer in
-- @better-auth/core/dist/social-providers/<provider>.mjs.
--
-- A WRONG value does not error — it fails to match and mints a duplicate user
-- on the next sign-in. scripts/dev/smoke-siws-contract.mjs asserts that path.
--
-- Measured on production before writing (33 rows): siws 14, google 7, kick 3,
-- siwe 3, twitter 3, twitch 2, discord 1, and ZERO duplicate
-- (providerId, accountId) pairs, so the unique index applies cleanly.
--
-- Reversible: DROP INDEX + DROP COLUMN.

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

-- Fail loudly rather than leave an account that can never log in. A provider
-- present in another database but not here would land in this branch.
DO $$
DECLARE unmapped text;
BEGIN
  SELECT string_agg(DISTINCT "providerId", ', ') INTO unmapped
  FROM "account" WHERE "issuer" IS NULL;
  IF unmapped IS NOT NULL THEN
    RAISE EXCEPTION 'unmapped providerId(s): % — add them to the CASE above', unmapped;
  END IF;
END $$;

-- NULLs are distinct in Postgres, so this tolerates the rows 1.6 keeps writing
-- with a NULL issuer between now and the deploy. Phase 2 backfills those.
CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_unique"
  ON "account" ("issuer", "accountId");

-- @better-auth/oauth-provider 1.7 client-registration fields. All nullable.
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "applicationType" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "clientDiscoveryId" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "clientCredentialsScopes" text;

COMMIT;
