-- Per-broadcast concurrent-viewer aggregates (studio S5: peak/average CCV per
-- stream). Additive columns on stream_sessions — no new table.
--
-- WHY AGGREGATES AND NOT A SAMPLES TABLE: the ivs-viewers cron runs every
-- minute and already carries every live channel's viewerCount, so folding a
-- running peak/sum/count into the open session costs one UPDATE per live
-- stream per minute and stays O(broadcasts). A samples table would grow by
-- (live streams × minutes) forever to answer the same two questions, and
-- nothing in the studio charts a time series today.
--
-- Apply to BOTH Supabase projects (dev + prod).

ALTER TABLE stream_sessions ADD COLUMN IF NOT EXISTS peak_viewers integer NOT NULL DEFAULT 0;
ALTER TABLE stream_sessions ADD COLUMN IF NOT EXISTS sample_count integer NOT NULL DEFAULT 0;
-- bigint: a long broadcast with a large audience sums past int4 in about a
-- week of minutes at 5k viewers, and this column only ever grows.
ALTER TABLE stream_sessions ADD COLUMN IF NOT EXISTS viewer_sum bigint NOT NULL DEFAULT 0;

-- Existing rows keep 0/0/0, which reads as "not measured" — every broadcast
-- before this landed genuinely has no samples, and backfilling a guess would
-- be worse than an honest dash in the UI.
