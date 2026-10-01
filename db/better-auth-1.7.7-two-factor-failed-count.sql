-- better-auth 1.7.1 -> 1.7.7 (2026-10-01): the twoFactor plugin now counts
-- failed verification attempts per enrolment and locks after
-- maxFailedAttempts. The adapter logs "Drizzle schema mismatch" on every
-- request until the column exists (seen in `next build` the day of the bump).
--
-- Additive and safe while 1.7.1 is still deployed: the old code never reads
-- or writes it, and the default covers every existing row. Applied to
-- production 2026-10-01 before the deploy, so scripts/db/check-drift.ts stays
-- green in CI.
ALTER TABLE "twoFactor" ADD COLUMN IF NOT EXISTS "failedVerificationCount" integer NOT NULL DEFAULT 0;
