-- Trending board — the /trending page's market-wide, every-chain coin table
-- ----------------------------------------------------------------------------
-- Run by hand (Supabase SQL editor or psql). Additive: one brand-new table, no
-- ALTER of anything existing, so it is safe against the live DB that dev also
-- points at. Mirrors db/schema/content/trending.ts — keep the two in sync.
--
-- This is a CACHE, not a ledger: rows are overwritten wholesale by
-- /api/cron/trending-sync and nothing references them, so it can be truncated
-- or dropped and rebuilt at any time with no data loss.
--
-- Deliberately separate from tracked_tokens (the alert watch list): that table
-- costs one API call per coin per scan pass, this one costs one call per CHAIN
-- per refresh. Mixing them would dilute the alert scan's priority queue until
-- no coin was scanned often enough to catch a cluster.

CREATE TABLE IF NOT EXISTS trending_coins (
    id                text PRIMARY KEY,          -- `${network}:${token_address}`
    network           text NOT NULL,
    token_address     text NOT NULL,
    pool_address      text NOT NULL,
    dex_id            text,

    symbol            text NOT NULL,
    name              text,
    image_url         text,

    price_usd         double precision,
    market_cap_usd    double precision,
    fdv_usd           double precision,
    liquidity_usd     double precision,

    volume_5m_usd     double precision,
    volume_1h_usd     double precision,
    volume_6h_usd     double precision,
    volume_24h_usd    double precision,

    price_change_5m   double precision,
    price_change_1h   double precision,
    price_change_6h   double precision,
    price_change_24h  double precision,

    buys_24h          integer,
    sells_24h         integer,
    txns_24h          integer,

    pool_created_at   timestamptz,               -- the "age" column
    rank              integer,                   -- position in its own chain's trending list
    fetched_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trending_network        ON trending_coins (network);
CREATE INDEX IF NOT EXISTS idx_trending_volume         ON trending_coins (volume_24h_usd DESC);
CREATE INDEX IF NOT EXISTS idx_trending_liquidity      ON trending_coins (liquidity_usd DESC);
CREATE INDEX IF NOT EXISTS idx_trending_fetched        ON trending_coins (fetched_at);
-- The chain-filtered default ordering, which is what the page opens on.
CREATE INDEX IF NOT EXISTS idx_trending_network_volume ON trending_coins (network, volume_24h_usd DESC);

ALTER TABLE trending_coins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trending_coins_public_read ON trending_coins;
CREATE POLICY trending_coins_public_read ON trending_coins
    FOR SELECT TO authenticated, anon USING (true);
