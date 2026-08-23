-- The channel moderation audit log (studio S2 panel 7 — "Mod Actions feed").
--
-- Additive and standalone: a new table, no changes to existing ones, nothing
-- to backfill. Every moderation verb the app had mutated state without leaving
-- a trace, so there is no history to recover — the log starts the day this
-- lands, which is the honest ceiling on what it can ever show.
--
-- Apply to BOTH Supabase projects (dev + prod). See CLAUDE.md: schema changes
-- ship as reviewable SQL under db/, never drizzle-kit push.

CREATE TABLE IF NOT EXISTS moderation_actions (
    id              text PRIMARY KEY,
    -- The CHANNEL the action happened in, not the actor: a moderator working
    -- in someone else's channel writes a row owned by that channel, which is
    -- what makes "my channel's mod log" one indexed read.
    creator_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    -- SET NULL, not CASCADE, on both people: deleting an account must not
    -- erase the record of what was done to it, or by it.
    actor_id        text REFERENCES "user"(id) ON DELETE SET NULL,
    target_user_id  text REFERENCES "user"(id) ON DELETE SET NULL,
    action          text NOT NULL,
    detail          text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- The only read pattern: one channel's log, newest first.
CREATE INDEX IF NOT EXISTS idx_mod_actions_channel
    ON moderation_actions (creator_id, created_at DESC);

ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;

-- Read your own channel's log. Writes go through the server (service role),
-- never the browser — a client that could INSERT here could forge the audit
-- trail, which defeats the point of having one.
DROP POLICY IF EXISTS mod_actions_channel_read ON moderation_actions;
CREATE POLICY mod_actions_channel_read ON moderation_actions
    FOR SELECT TO authenticated
    USING (creator_id = (SELECT auth.uid()::text));
