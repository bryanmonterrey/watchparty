-- ============================================================
-- "Hide checkmark" privacy setting — additive, idempotent.
-- Safe on the shared dev == prod Supabase DB; reversible via
-- DROP COLUMN. Run by hand, not drizzle push.
-- Mirrors db/schema/auth/user.ts.
-- ============================================================

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "hideVerifiedBadge" boolean DEFAULT false NOT NULL;
