-- Going live creates a post (docs/next-session.md #2).
--
-- Two additive, nullable columns. Applied by hand to BOTH Supabase projects
-- (prod ugpzuypo…, dev hghxcuro…) per CLAUDE.md — no drizzle-kit push, which
-- can clobber the auth tables ported verbatim from the old app.

-- ── posts."streamId" ────────────────────────────────────────────────────────
--
-- Which stream this post IS. A stream and its playback are one post, the way a
-- video already is, so the recording must be able to find the post the
-- broadcast already created — otherwise the VOD lands as a SECOND feed entry
-- for the same broadcast.
--
-- Keyed on the stream rather than the session because the post is written at
-- startBroadcast, BEFORE the encoder connects; the stream_sessions row does not
-- exist until IVS fires "Stream Start".
ALTER TABLE posts ADD COLUMN IF NOT EXISTS "streamId" text;

-- Partial: only stream posts carry the column, and the only query is
-- "the live post for this stream", so indexing the nulls costs storage for rows
-- that are never looked up this way.
CREATE INDEX IF NOT EXISTS idx_posts_stream_id
    ON posts ("streamId")
    WHERE "streamId" IS NOT NULL;

-- ── streams.tags ────────────────────────────────────────────────────────────
--
-- The coins a stream's title tags, stored as INTENT alongside the title and the
-- ticker — same reasoning as streams.ticker (db/stream-coin-columns.sql).
--
-- It has to be persisted rather than sent at go-live, because `useCashtagField`
-- only fills `picked` when the author selects from the `$` menu and never
-- rehydrates it from existing text. Stream setup and pressing "Start broadcast"
-- are routinely separated by a reload — unlike the composer, where you type and
-- post in one breath — and across that reload the title still reads "$TICKER"
-- while the tags are gone. Storing them at title-save time is what makes the
-- picker on the stream title actually mean something.
--
-- Still filtered against the saved title at go-live: an author can pick a coin
-- and then delete it from the text, and storing that would put their avatar on
-- a chart for a stream that never mentions it.
ALTER TABLE streams ADD COLUMN IF NOT EXISTS tags jsonb;
