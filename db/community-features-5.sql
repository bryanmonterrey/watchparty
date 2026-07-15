-- Community batch 5: server settings pro pass. Additive. Applied 2026-07-15.
--
-- tag             short server tag shown on the profile card / dropdown
-- automod_keywords comma-separated blocked words (guests' messages rejected)
-- nickname        per-server display name (Discord "per-server profile")
-- muted           per-member server mute (suppresses unread badges)

ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS automod_keywords text;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS muted boolean;

-- Bans: kicked users can rejoin with an invite; banned users cannot.
CREATE TABLE IF NOT EXISTS community_bans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    reason text,
    banned_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_bans_server_user UNIQUE (server_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_community_bans_server ON community_bans (server_id);

ALTER TABLE community_bans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_bans_select_member ON community_bans
        FOR SELECT TO authenticated
        USING (EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit log: mod-visible trail of server management actions.
CREATE TABLE IF NOT EXISTS community_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    actor_user_id text NOT NULL,
    action text NOT NULL,
    detail text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_audit_server_created ON community_audit_log (server_id, created_at DESC);

ALTER TABLE community_audit_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_audit_select_member ON community_audit_log
        FOR SELECT TO authenticated
        USING (EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
