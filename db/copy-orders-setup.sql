-- ============================================================
-- Auto-copy executor tables/columns (docs/exp-callouts.md §4d walk-away) —
-- additive, idempotent. Safe on shared dev == prod; reversible. Run by hand.
-- Mirrors db/schema/content/copy-order.ts + copy_subscriptions.autoCopyRoleId.
-- ============================================================

ALTER TABLE "copy_subscriptions" ADD COLUMN IF NOT EXISTS "autoCopyRoleId" integer;

CREATE TABLE IF NOT EXISTS "copy_orders" (
  "id"            text PRIMARY KEY,
  "followerId"    text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "traderId"      text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "leaderTradeId" text NOT NULL,
  "usdSize"       double precision NOT NULL,
  "txSignature"   text,
  "status"        text NOT NULL,
  "reason"        text,
  "createdAt"     timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_copy_orders_follower_time" ON "copy_orders" ("followerId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_copy_orders_pair_time" ON "copy_orders" ("followerId", "traderId", "createdAt");

ALTER TABLE "copy_orders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "copy_orders_select_own" ON "copy_orders";
CREATE POLICY "copy_orders_select_own" ON "copy_orders" FOR SELECT TO authenticated USING ("followerId" = (SELECT auth.uid()::text));
