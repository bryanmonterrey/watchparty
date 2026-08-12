-- Holder-quality columns on trending_coins, so the board can filter the way
-- Photon and Axiom do — on structure, not on names.
--
-- WHY
--
-- `trending_coins` is GeckoTerminal-fed and carries market data only: price,
-- volume, liquidity, txns. It has no idea who HOLDS a coin. So the board's only
-- possible spam defence was name matching (`clearsBrandBar`), and name matching
-- provably cannot do the job: measured 2026-08-12, it cannot tell `preOPENAI`
-- ($5.4M, an impersonator) from `CBETH` ("Coinbase Wrapped Staked ETH", $4.4M,
-- a real Coinbase product). Both match the same brand term. Liquidity is the
-- only thing separating them today, and it does that by accident.
--
-- Concentration is different: it is a property of the scam itself. A coin whose
-- top 10 wallets hold 90% is a rug regardless of what it calls itself, and a
-- legitimate wrapped asset never looks like that.
--
-- These ride FREE on Mobula's chain-wide pairs feed — the same response that
-- already carries price and volume, no extra call and no extra credit (see the
-- MobulaPair interface in lib/coins/mobula.ts, which already parses them for
-- the /trade board).
--
-- Additive and nullable, per CLAUDE.md: safe on live data, reversible, and a
-- row synced from a chain Mobula does not serve simply leaves them NULL — which
-- `isRiskyHoldings` already treats as "no data", never as "risky".
--
-- APPLY TO BOTH PROJECTS (prod ugpzuypo… and dev hghxcuro…).

ALTER TABLE trending_coins
    ADD COLUMN IF NOT EXISTS top10_pct        double precision,
    ADD COLUMN IF NOT EXISTS dev_pct          double precision,
    ADD COLUMN IF NOT EXISTS snipers_pct      double precision,
    ADD COLUMN IF NOT EXISTS insiders_pct     double precision,
    ADD COLUMN IF NOT EXISTS bundlers_pct     double precision,
    ADD COLUMN IF NOT EXISTS holders_count    integer,
    -- Which provider wrote this row. Mobula carries holder stats; GeckoTerminal
    -- does not, so a NULL top10_pct means "GT row" rather than "clean coin" —
    -- a distinction the board has to be able to make while both sources run.
    ADD COLUMN IF NOT EXISTS source           text;

-- The board's hot path is "fresh rows for a chain, ordered by volume". Adding
-- the freshness filter (STALE_AFTER_MS) to the existing volume index keeps that
-- a single index scan now that every read is time-bounded.
CREATE INDEX IF NOT EXISTS idx_trending_fetched_at ON trending_coins (fetched_at DESC);
