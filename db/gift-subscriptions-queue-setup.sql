-- ============================================================
-- Gift-subscription credit queue (design decision 2026-07-20) —
-- additive/idempotent-ish (DROP NOT NULL is safe to re-run; the
-- index uses IF NOT EXISTS). Safe on the shared dev == prod
-- Supabase DB. Mirrors db/schema/content/subscription.ts.
-- ============================================================

ALTER TABLE "gift_subscriptions" ALTER COLUMN "recipientId" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_gift_queued" ON "gift_subscriptions" ("creatorId", "recipientId", "status");
