-- coin_candles: OHLCV we own, so a chart read never leaves our database.
--
-- See db/schema/content/coin-candles.ts and docs/live-charts-plan.md for why
-- (GeckoTerminal rate-limits by IP; the Worker's egress is shared, so renting
-- data on the read path fails exactly when traffic arrives).
--
-- Purely additive: a new table, nothing existing touched. Safe on live.

CREATE TABLE IF NOT EXISTS coin_candles (
    network      text   NOT NULL,
    pool_address text   NOT NULL,
    resolution   text   NOT NULL,   -- '1' | '60' | '1D' only
    ts           bigint NOT NULL,   -- bar open, unix seconds

    o double precision NOT NULL,
    h double precision NOT NULL,
    l double precision NOT NULL,
    c double precision NOT NULL,
    v double precision,

    PRIMARY KEY (network, pool_address, resolution, ts)
);

-- Reads are always "this series, newest N bars in a window".
CREATE INDEX IF NOT EXISTS coin_candles_series_idx
    ON coin_candles (network, pool_address, resolution, ts);
