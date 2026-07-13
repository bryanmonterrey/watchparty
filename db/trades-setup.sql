-- ============================================================
-- Trades ledger (Phase 4a of gamification: server-witnessed swaps) —
-- additive, idempotent. Safe on the shared dev == prod Supabase DB;
-- reversible via DROP TABLE. Run by hand, not via drizzle push.
-- Mirrors db/schema/content/trade.ts. Design doc: docs/exp-callouts.md §4a.
-- ============================================================

CREATE TABLE IF NOT EXISTS "trades" (
  "id"            text PRIMARY KEY,
  "userId"        text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "walletAddress" text NOT NULL,
  "txSignature"   text,
  "inputMint"     text NOT NULL,
  "outputMint"    text NOT NULL,
  "inAmountRaw"   text NOT NULL,
  "outAmountRaw"  text NOT NULL,
  "usdValue"      double precision,
  "source"        text DEFAULT 'app' NOT NULL,
  "status"        text DEFAULT 'pending' NOT NULL,
  "createdAt"     timestamp DEFAULT now() NOT NULL,
  "confirmedAt"   timestamp
);
-- Chain signatures are globally unique; multiple NULLs (unreported) are fine.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_trades_signature" ON "trades" ("txSignature");
CREATE INDEX IF NOT EXISTS "idx_trades_user_time" ON "trades" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_trades_status_time" ON "trades" ("status", "createdAt");

ALTER TABLE "trades" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trades_select_own" ON "trades";
CREATE POLICY "trades_select_own" ON "trades" FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid()::text));
