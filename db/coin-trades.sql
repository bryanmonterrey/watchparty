-- Public per-pool swap tape, fed by the Helius enhanced webhook.
-- Schema mirror of db/schema/content/coin-trades.ts. Additive and nullable
-- where it can be, per the repo's rule about the shared production database.
--
-- Apply with psql against DIRECT_URL. Safe to re-run.

CREATE TABLE IF NOT EXISTS coin_trades (
    network        text             NOT NULL,
    pool_address   text             NOT NULL,
    token_address  text             NOT NULL,
    signature      text             NOT NULL,
    ts             bigint           NOT NULL,
    trader         text             NOT NULL,
    side           text             NOT NULL,
    amount_token   double precision,
    amount_usd     double precision,
    price_usd      double precision,
    -- One aggregator tx can route through several watched pools; each leg is
    -- its own row, so the key is the pair, not the signature alone.
    PRIMARY KEY (signature, pool_address)
);

CREATE INDEX IF NOT EXISTS coin_trades_pool_ts_idx
    ON coin_trades (network, pool_address, ts);

CREATE INDEX IF NOT EXISTS coin_trades_token_ts_idx
    ON coin_trades (network, token_address, ts);
