-- better-auth 1.7 account-identity migration, PHASE 2 of 2 (enforce).
--
-- RUN ONLY AFTER THE 1.7 DEPLOY IS LIVE AND HEALTHY. Before that, the running
-- 1.6 code inserts account rows with no `issuer`, and NOT NULL would fail every
-- new signup.
--
-- The re-backfill is not redundant: any account created by 1.6 between phase 1
-- and the deploy has a NULL issuer, and 1.7 would not match it — that user
-- would get a duplicate account on their next sign-in rather than an error.
-- This closes that window before locking the column.

BEGIN;

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

COMMIT;
