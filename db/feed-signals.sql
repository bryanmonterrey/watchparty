-- ----------------------------------------------------------------------------
-- feed_signals — engagement event log for the Phoenix (x-algorithm) ranker
-- ----------------------------------------------------------------------------
-- Run by hand (Supabase SQL editor / psql). Additive + nullable-safe: creates a
-- NEW table only, touches no existing rows. NOT part of drizzle-kit push
-- (this repo never runs migrations — see db/feed-indexes.sql).
--
-- Schema mirrors db/schema/content/feed_signals.ts. actionType values are
-- Phoenix's own action indices (1=fav, 4=reply, 5=quote, 6=repost, 11=dwell,
-- 13=video-view, 20=negative-feedback, 21=trade[reserved]).
--
-- subjectId is intentionally NOT a foreign key: it references posts.id OR
-- streams.id (subjectType disambiguates). Orphaned signals after content
-- deletion are harmless (append-only log) and cleaned by retention, if any.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feed_signals (
    id            text PRIMARY KEY,
    "userId"      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "subjectId"   text NOT NULL,
    "subjectType" text NOT NULL DEFAULT 'post',
    "authorId"    text,
    "actionType"  smallint NOT NULL,
    value         real NOT NULL DEFAULT 1,
    surface       text NOT NULL DEFAULT 'home',
    "createdAt"   timestamp NOT NULL DEFAULT now()
);

-- Assemble a user's most-recent-N history (the ranker's primary read path).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feed_signals_user_time
    ON feed_signals ("userId", "createdAt");

-- Per-content aggregation (popularity, training labels).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feed_signals_subject
    ON feed_signals ("subjectId", "subjectType");

-- RLS: a user may only write/read their own signals from the client. Aggregate
-- reads for ranking/training run server-side via the privileged connection.
ALTER TABLE feed_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_signals_insert_own ON feed_signals
    FOR INSERT TO authenticated
    WITH CHECK ("userId" = (SELECT auth.uid()::text));

CREATE POLICY feed_signals_select_own ON feed_signals
    FOR SELECT TO authenticated
    USING ("userId" = (SELECT auth.uid()::text));
