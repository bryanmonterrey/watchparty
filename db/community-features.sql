-- Community features: channel ordering, message replies, pins, read state.
-- All additive/nullable — safe on the live DB (dev == prod). Applied 2026-07-15.

-- Channel ordering (null = fall back to created_at; positions are per-server)
ALTER TABLE community_channels ADD COLUMN IF NOT EXISTS position integer;

-- Message replies (self-reference; ON DELETE SET NULL keeps the child message
-- when the parent is hard-deleted)
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid
    REFERENCES community_messages(id) ON DELETE SET NULL;

-- Message pins
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_community_messages_pinned
    ON community_messages (channel_id) WHERE pinned;

-- Per-member channel read state (unread = messages created after last_read_at)
CREATE TABLE IF NOT EXISTS community_channel_reads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
    channel_id uuid NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
    last_read_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_channel_reads_member_channel UNIQUE (member_id, channel_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_reads_channel ON community_channel_reads (channel_id);

ALTER TABLE community_channel_reads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_channel_reads_own ON community_channel_reads
        FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text)))
        WITH CHECK (EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
