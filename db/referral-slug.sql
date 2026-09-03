-- Referral links are permanent (2026-09-03).
--
-- referral_slug is the part after `/?ref=` in a user's link. It is claimed
-- ONCE from the username the first time the user sees their link and is never
-- touched by a rename, so shared links keep working and a freed username
-- cannot be re-registered to hijack them. Resolution in
-- server/routers/referral.ts is slug -> username -> code, the first two
-- case-insensitive, hence the lower() indexes. Additive + idempotent.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS referral_slug text;

-- One link per name, regardless of case.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_referral_slug_lower ON "user" (lower(referral_slug));

-- applyCode matches usernames case-insensitively (6 of 41 live usernames
-- contain capitals; the old exact match made their links dead).
CREATE INDEX IF NOT EXISTS idx_user_username_lower ON "user" (lower(username));

-- Codes were only indexed, never unique; the generator's existence check was
-- the sole guard. 0 duplicates at the time of writing.
DROP INDEX IF EXISTS idx_user_referral_code;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_referral_code ON "user" ("referralCode");

-- Backfill: anyone who has already generated a code has seen (and may have
-- shared) a username link, so freeze that name for them now.
UPDATE "user" u
SET referral_slug = u.username
WHERE u."referralCode" IS NOT NULL
  AND u.username IS NOT NULL
  AND u.referral_slug IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM "user" o
      WHERE o.id <> u.id AND lower(o.referral_slug) = lower(u.username)
  );
