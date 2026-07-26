-- Coin alert feed — the /home left rail (fomo-style multi-chain alerts)
-- ----------------------------------------------------------------------------
-- Run by hand (Supabase SQL editor or psql). This repo never runs migrations
-- and never uses `drizzle-kit push` (it can clobber the ported auth tables) —
-- see CLAUDE.md. Everything here is ADDITIVE: two brand-new tables, no ALTER of
-- an existing one, so it is safe against the live DB that dev also points at.
--
-- Mirrors db/schema/content/coin-feed.ts. Keep the two in sync by hand.
--
-- The CREATE INDEX statements are CONCURRENTLY-free on purpose: the tables are
-- empty at creation time, so there is nothing to lock. Re-running the whole
-- file is safe (every statement is IF NOT EXISTS / idempotent).

-- 1) tracked_tokens — every coin we watch, across chains. `network` is the
--    GeckoTerminal network slug ("solana", "base", "eth", …). Watchparty
--    launches are mirrored in here with wp_token_id set, so the scanner has one
--    loop and the rail can deep-link to our own coin page.
CREATE TABLE IF NOT EXISTS tracked_tokens (
    id                text PRIMARY KEY,                  -- `${network}:${token_address}`
    network           text NOT NULL,
    token_address     text NOT NULL,
    pool_address      text NOT NULL,
    dex_id            text,

    symbol            text NOT NULL,
    name              text,
    image_url         text,

    wp_token_id       text,                              -- tokens.id when we launched it (no FK on purpose)

    price_usd         double precision,
    market_cap_usd    double precision,
    liquidity_usd     double precision,
    volume_24h_usd    double precision,
    price_change_5m   double precision,
    price_change_1h   double precision,
    price_change_24h  double precision,

    pinned            boolean NOT NULL DEFAULT false,

    last_trade_at     timestamptz,                       -- cluster-scan watermark
    last_scan_at      timestamptz,                       -- round-robin cursor
    last_synced_at    timestamptz,

    first_seen_at     timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_tokens_pool ON tracked_tokens (network, pool_address);
CREATE INDEX IF NOT EXISTS idx_tracked_tokens_scan       ON tracked_tokens (last_scan_at);
CREATE INDEX IF NOT EXISTS idx_tracked_tokens_network    ON tracked_tokens (network);
CREATE INDEX IF NOT EXISTS idx_tracked_tokens_wp         ON tracked_tokens (wp_token_id);

ALTER TABLE tracked_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracked_tokens_public_read ON tracked_tokens;
CREATE POLICY tracked_tokens_public_read ON tracked_tokens
    FOR SELECT TO authenticated, anon USING (true);

-- 2) coin_feed_events — the rail's item stream. Append-only, one table so the
--    rail paginates on a single (occurred_at, id) keyset cursor instead of
--    unioning clusters + callouts + predictions at read time.
CREATE TABLE IF NOT EXISTS coin_feed_events (
    id                text PRIMARY KEY,
    kind              text NOT NULL,                     -- see COIN_FEED_KINDS in the schema file
    network           text NOT NULL,

    tracked_token_id  text,
    wp_token_id       text,
    token_address     text,
    symbol            text NOT NULL,
    token_image_url   text,

    side              text,                              -- 'buy' | 'sell' (cluster/whale kinds)
    trader_count      integer,
    usd_value         double precision,
    market_cap_usd    double precision,                  -- MC at the moment of the event
    traders           jsonb,                             -- [{ address, userId?, username?, avatarUrl? }]

    actor_id          text,                              -- caller (callouts)
    ref_id            text,                              -- callout id / market id
    title             text,                              -- prediction question, etc.

    dedupe_key        text NOT NULL,                     -- idempotency for re-scans

    occurred_at       timestamptz NOT NULL,              -- on-chain time; the sort key
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coin_feed_dedupe ON coin_feed_events (dedupe_key);
-- The rail's only ORDER BY; id breaks ties so the keyset cursor is total.
CREATE INDEX IF NOT EXISTS idx_coin_feed_cursor  ON coin_feed_events (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_coin_feed_kind    ON coin_feed_events (kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_feed_network ON coin_feed_events (network, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_feed_token   ON coin_feed_events (tracked_token_id, occurred_at DESC);

ALTER TABLE coin_feed_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coin_feed_events_public_read ON coin_feed_events;
CREATE POLICY coin_feed_events_public_read ON coin_feed_events
    FOR SELECT TO authenticated, anon USING (true);

-- 3) Realtime — the rail subscribes to INSERTs so a new alert can arrive
--    without waiting for the poll. Skips silently if it is already a member.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE coin_feed_events;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;   -- publication absent (non-Supabase target)
END
$$;

-- 4) Backfill the native event kinds so the rail isn't empty on day one.
--    Both are ON CONFLICT no-ops, so re-running the file is safe.

-- Callouts → 'callout' events, joined to the coin they called.
INSERT INTO coin_feed_events (
    id, kind, network, wp_token_id, token_address, symbol, token_image_url,
    usd_value, market_cap_usd, actor_id, ref_id, dedupe_key, occurred_at, created_at
)
SELECT
    'cf_callout_' || c.id,
    'callout',
    'solana',
    t.id,
    t."tokenAddress",
    t.ticker,
    t."imageUrl",
    NULL,
    c."marketCapAtCall",
    c."userId",
    c.id,
    'callout:' || c.id,
    -- callouts."createdAt" is `timestamp WITHOUT time zone` (the older tables
    -- all are); occurred_at is timestamptz. Naming the source zone explicitly
    -- beats relying on the session's TimeZone setting being UTC.
    c."createdAt" AT TIME ZONE 'UTC',
    now()
FROM callouts c
JOIN tokens t ON t.id = c."tokenId"
ON CONFLICT (dedupe_key) DO NOTHING;

-- Open prediction markets → 'prediction' events. No coin attached, so symbol
-- carries the category and the row renders off `title`.
INSERT INTO coin_feed_events (
    id, kind, network, symbol, title, actor_id, ref_id, dedupe_key, occurred_at, created_at
)
SELECT
    'cf_market_' || m.id::text,
    'prediction',
    'solana',
    COALESCE(m.category, 'general'),
    m.question,
    m.creator_id,
    m.id::text,
    'prediction:' || m.id::text,
    m.created_at,
    now()
FROM prediction_markets m
WHERE m.status = 'open'
ON CONFLICT (dedupe_key) DO NOTHING;
