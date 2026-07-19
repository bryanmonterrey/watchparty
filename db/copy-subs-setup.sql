-- ============================================================
-- Copy-trade subscriptions (docs/exp-callouts.md §4d, tiers gated on creator
-- subs) — additive, idempotent. Safe on shared dev == prod; reversible.
-- Run by hand. Mirrors db/schema/content/copy.ts.
-- ============================================================

CREATE TABLE IF NOT EXISTS "copy_subscriptions" (
  "id"             text PRIMARY KEY,
  "followerId"     text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "traderId"       text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "maxUsdcPerCopy" double precision NOT NULL,
  "dailyUsdcCap"   double precision NOT NULL,
  "paused"         boolean DEFAULT false NOT NULL,
  "createdAt"      timestamp DEFAULT now() NOT NULL,
  "updatedAt"      timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_copy_subs_pair" ON "copy_subscriptions" ("followerId", "traderId");
CREATE INDEX IF NOT EXISTS "idx_copy_subs_trader" ON "copy_subscriptions" ("traderId");

ALTER TABLE "copy_subscriptions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "copy_subs_follower_all" ON "copy_subscriptions";
CREATE POLICY "copy_subs_follower_all" ON "copy_subscriptions" FOR ALL TO authenticated USING ("followerId" = (SELECT auth.uid()::text));
