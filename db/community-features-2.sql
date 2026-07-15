-- Community batch 2: reactions + server rail ordering. Additive. Applied 2026-07-15.

CREATE TABLE IF NOT EXISTS community_message_reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
    member_id uuid NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
    emoji text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_reaction_message_member_emoji UNIQUE (message_id, member_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON community_message_reactions (message_id);

ALTER TABLE community_message_reactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_message_reactions_select ON community_message_reactions
        FOR SELECT TO authenticated
        USING (EXISTS (
            SELECT 1 FROM community_messages m
            JOIN community_channels c ON c.id = m.channel_id
            JOIN community_members cm ON cm.server_id = c.server_id
            WHERE m.id = message_id AND cm.user_id = (SELECT auth.uid()::text)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY community_message_reactions_own ON community_message_reactions
        FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text)))
        WITH CHECK (EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Server rail ordering (per-user ordering would need a join table; global
-- per-owner ordering is Discord-equivalent for now: order my rail by when I
-- joined + explicit position)
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS rail_position integer;
