-- Community batch 3: read-only channels + server boosts. Additive. Applied 2026-07-15.

-- Read-only channels: guests can read but only mods/admins post (null = writable)
ALTER TABLE community_channels ADD COLUMN IF NOT EXISTS read_only boolean;

-- Server boosts: one boost per member per server (free v1 — a support signal,
-- not a payment; monetized boosting can layer on later)
CREATE TABLE IF NOT EXISTS community_server_boosts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    member_id uuid NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_server_boosts_server_member UNIQUE (server_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_server_boosts_server ON community_server_boosts (server_id);

ALTER TABLE community_server_boosts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_server_boosts_select ON community_server_boosts
        FOR SELECT TO authenticated
        USING (EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY community_server_boosts_own ON community_server_boosts
        FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text)))
        WITH CHECK (EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
