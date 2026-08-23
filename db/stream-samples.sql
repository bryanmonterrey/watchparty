-- Per-minute concurrent-viewer samples, for the broadcast detail chart.
--
-- This does NOT replace the peak/avg aggregates on stream_sessions
-- (db/stream-session-ccv.sql) — they answer different questions and only one
-- is cheap to keep forever. The aggregates are a number; this is a shape, and
-- a shape needs points.
--
-- BOUNDED ON PURPOSE: the ivs-viewers cron writes one row per live broadcast
-- per minute (a four-hour stream is 240 rows) and prunes past the retention
-- window on the same pass. When the samples age out the aggregates remain, so
-- an old broadcast keeps its peak and average and loses only its chart.
--
-- Apply to BOTH Supabase projects (dev + prod).

CREATE TABLE IF NOT EXISTS stream_samples (
    id          text PRIMARY KEY,
    session_id  text NOT NULL REFERENCES stream_sessions(id) ON DELETE CASCADE,
    at          timestamptz NOT NULL DEFAULT now(),
    viewers     integer NOT NULL DEFAULT 0
);

-- The only read pattern (one session, in time order), and the index the prune
-- walks.
CREATE INDEX IF NOT EXISTS idx_stream_samples_session
    ON stream_samples (session_id, at);

ALTER TABLE stream_samples ENABLE ROW LEVEL SECURITY;

-- Deliberately unreadable from the browser: these rows carry no user column,
-- so there is nothing to scope a policy to. Reads go through
-- stream.broadcastDetail, which verifies ownership of the SESSION first.
DROP POLICY IF EXISTS stream_samples_no_client_read ON stream_samples;
CREATE POLICY stream_samples_no_client_read ON stream_samples
    FOR SELECT TO authenticated
    USING (false);
