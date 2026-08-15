-- Make `trending_coins.liquidity_usd` a MAINTAINED measurement instead of a
-- write-once fill.
--
-- Additive and nullable. Apply to BOTH Supabase projects per CLAUDE.md.
--
-- ## The defect this fixes
--
-- The liquidity screen selected `WHERE liquidity_usd IS NULL`. That makes it
-- fill-only: a row that already carries a value is invisible to it forever, so
--
--   * a WRONG value can never be corrected (the Dexscreener figures written on
--     2026-08-13 put SNDK at $256,075 where Mobula and GeckoTerminal
--     independently measure $2-4, and nothing in the system could revise it);
--   * a STALE value is never refreshed, though liquidity is a market quantity
--     that moves minute to minute and we were storing it as if it were static.
--
-- Every previous fix here addressed "how do we fill the blanks" — the producer,
-- the erase-on-upsert, the provider. None addressed "how does this column stay
-- true", which is why the same issue kept returning wearing a new hat.
--
-- ## Why a timestamp rather than nulling the bad rows
--
-- Nulling would clear the wrong values, but it also blanks the column for every
-- reader in the meantime and leaves the system with the same one-shot
-- behaviour — the next wrong write would be just as permanent. A screened-at
-- stamp makes the column self-correcting by construction: NULL means "never
-- screened", which every Dexscreener-era row now is, so they are all
-- immediately eligible for re-measurement and get OVERWRITTEN in place. No
-- reader ever sees a gap.
--
-- Stamped on every ATTEMPT, not only on success, so a coin the provider cannot
-- price stops monopolising the head of the queue.
ALTER TABLE trending_coins ADD COLUMN IF NOT EXISTS liquidity_screened_at timestamptz;

-- The screen's access path: never-screened first, then oldest-screened.
-- NULLS FIRST is the default for ASC in Postgres, which is exactly the order
-- the screen wants, so the index matches the query without an opclass.
CREATE INDEX IF NOT EXISTS idx_trending_liquidity_screened_at
    ON trending_coins (liquidity_screened_at ASC);
