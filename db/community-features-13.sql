-- Community features batch 13: channel categories (Discord parity).
-- User-named collapsible groups in the channel sidebar; channels keep working
-- ungrouped (category_id NULL = the existing type sections). Additive + idempotent.

CREATE TABLE IF NOT EXISTS community_channel_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    name text NOT NULL,
    position integer,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_categories_server ON community_channel_categories (server_id);

ALTER TABLE community_channel_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_categories_select_member ON community_channel_categories
        FOR SELECT TO authenticated
        USING (EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Deleting a category ungroups its channels (never deletes them).
ALTER TABLE community_channels
    ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES community_channel_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_community_channels_category ON community_channels (category_id);
