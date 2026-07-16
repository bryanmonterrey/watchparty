-- Community batch 11: voice channels, multi invite links, widget, activity.
-- Additive. Applied 2026-07-16.
--
-- channels.media_meeting_id   RealtimeKit meeting for AUDIO/VIDEO channels
--                             (lazily created on first join, like Spaces)
-- widget_enabled              public /widget/[serverId] embed page
-- activity_feed               "Active now" (live members) in the channel sidebar
-- inactive_channel_id/-timeout voice AFK: idle members auto-move after N minutes
-- community_invites           multiple invite links with uses/expiry per link

ALTER TABLE community_channels ADD COLUMN IF NOT EXISTS media_meeting_id text;

ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS widget_enabled boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS activity_feed boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS inactive_channel_id uuid;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS inactive_timeout_minutes integer;

CREATE TABLE IF NOT EXISTS community_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    code text NOT NULL UNIQUE,
    created_by text NOT NULL,
    max_uses integer,
    uses integer NOT NULL DEFAULT 0,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_invites_server ON community_invites (server_id);

ALTER TABLE community_invites ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_invites_select_member ON community_invites
        FOR SELECT TO authenticated
        USING (EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
