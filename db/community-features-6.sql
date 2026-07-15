-- Community batch 6: expressions (emoji/stickers) + invite pausing. Additive.
-- Applied 2026-07-15.

-- Access: admins can pause invites (joins via link rejected while paused)
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS invites_paused boolean;

-- Custom server expressions: kind = 'emoji' (rendered inline via :name:)
-- or 'sticker' (sent as an image message from the chat picker)
CREATE TABLE IF NOT EXISTS community_expressions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    kind text NOT NULL,
    name text NOT NULL,
    image_url text NOT NULL,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_expressions_server_kind_name UNIQUE (server_id, kind, name)
);
CREATE INDEX IF NOT EXISTS idx_community_expressions_server ON community_expressions (server_id);

ALTER TABLE community_expressions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_expressions_select_member ON community_expressions
        FOR SELECT TO authenticated
        USING (EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
