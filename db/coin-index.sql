-- coin_index: address -> chain + pool, for coins nobody here tracks.
--
-- Backs /coin/<address> resolving any coin on any chain. See
-- db/schema/content/coin-index.ts for why this is separate from tracked_tokens
-- (that table is the alert feed's work queue; rows here must not enter the scan
-- rotation).
--
-- Purely additive: a new table, no changes to anything existing. Safe to run
-- against the live database.

CREATE TABLE IF NOT EXISTS coin_index (
    id              text PRIMARY KEY,
    network         text NOT NULL,
    token_address   text NOT NULL,
    pool_address    text NOT NULL,
    dex_id          text,

    symbol          text NOT NULL,
    name            text,
    image_url       text,

    price_usd         double precision,
    market_cap_usd    double precision,
    liquidity_usd     double precision,
    volume_24h_usd    double precision,
    price_change_24h  double precision,
    buys_24h          double precision,
    sells_24h         double precision,

    source          text NOT NULL,
    resolved_at     timestamptz NOT NULL DEFAULT now()
);

-- Lookups come in by address, with the chain usually unknown. Not unique: the
-- same address can exist on several chains.
CREATE INDEX IF NOT EXISTS coin_index_token_address_idx
    ON coin_index (token_address);
