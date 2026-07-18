-- ============================================================
-- Mint price/decimals cache + unrealized PnL column — additive, idempotent.
-- Safe on the shared dev == prod Supabase DB; reversible. Run by hand.
-- Mirrors db/schema/content/mint-price.ts + pnl_snapshots.unrealizedUsd.
-- Design doc: docs/exp-callouts.md §4b (unrealized layer).
-- ============================================================

CREATE TABLE IF NOT EXISTS "mint_prices" (
  "mint"      text PRIMARY KEY,
  "decimals"  integer,
  "priceUsd"  double precision,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "mint_prices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mint_prices_select_public" ON "mint_prices";
CREATE POLICY "mint_prices_select_public" ON "mint_prices" FOR SELECT TO authenticated, anon USING (true);

ALTER TABLE "pnl_snapshots" ADD COLUMN IF NOT EXISTS "unrealizedUsd" double precision DEFAULT 0 NOT NULL;
