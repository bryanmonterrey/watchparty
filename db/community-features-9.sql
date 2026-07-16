-- Community batch 9: safety levels, custom roles, boost perks, discovery.
-- Additive. Applied 2026-07-15.
--
-- verification_level  none|low|medium|high — posting requirements for members
-- require_mod_2fa     destructive mod actions require the actor to have 2FA
-- blur_media          image attachments render blurred until clicked
-- discoverable        listed on the communities landing; joinable without invite
-- banner_image_url    profile-card banner image (boost level 1+ perk)

ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS verification_level text;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS require_mod_2fa boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS blur_media boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS discoverable boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS banner_image_url text;

-- Custom roles: cosmetic identity (colored names, badges) layered over the
-- three functional tiers (ADMIN/MODERATOR/GUEST keep the permissions).
CREATE TABLE IF NOT EXISTS community_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL,
    position integer,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_roles_server ON community_roles (server_id);

ALTER TABLE community_roles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_roles_select_member ON community_roles
        FOR SELECT TO authenticated
        USING (EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS community_member_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES community_roles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_member_roles UNIQUE (member_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_member_roles_member ON community_member_roles (member_id);
CREATE INDEX IF NOT EXISTS idx_member_roles_role ON community_member_roles (role_id);

ALTER TABLE community_member_roles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_member_roles_select ON community_member_roles
        FOR SELECT TO authenticated
        USING (EXISTS (
            SELECT 1 FROM community_members m
            JOIN community_members me ON me.server_id = m.server_id
            WHERE m.id = member_id AND me.user_id = (SELECT auth.uid()::text)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
