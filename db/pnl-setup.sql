-- ============================================================
-- PnL snapshots + trade-sharing opt-in (Phase 4b/4c of gamification) —
-- additive, idempotent. Safe on the shared dev == prod Supabase DB;
-- reversible via DROP TABLE / DROP COLUMN. Run by hand, not drizzle push.
-- Mirrors db/schema/content/pnl.ts + user.shareTrades.
-- Design doc: docs/exp-callouts.md §4b–4c.
-- ============================================================

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "shareTrades" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "pnl_snapshots" (
  "id"          text PRIMARY KEY,
  "userId"      text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "window"      text NOT NULL,
  "realizedUsd" double precision DEFAULT 0 NOT NULL,
  "volumeUsd"   double precision DEFAULT 0 NOT NULL,
  "tradeCount"  integer DEFAULT 0 NOT NULL,
  "winRate"     double precision,
  "computedAt"  timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pnl_snapshots_key" ON "pnl_snapshots" ("userId", "window");

ALTER TABLE "pnl_snapshots" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pnl_snapshots_select_own" ON "pnl_snapshots";
CREATE POLICY "pnl_snapshots_select_own" ON "pnl_snapshots" FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid()::text));
