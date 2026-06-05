-- ============================================================
-- Community Spaces (live audio rooms) — additive, idempotent.
-- Safe to re-run. Mirrors db/schema/community/spaces.ts.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE community_space_status AS ENUM ('LIVE', 'ENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE community_space_role AS ENUM ('HOST', 'SPEAKER', 'LISTENER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS community_spaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  status      community_space_status NOT NULL DEFAULT 'LIVE',
  host_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  server_id   uuid REFERENCES community_servers(id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_spaces_status ON community_spaces(status);
CREATE INDEX IF NOT EXISTS idx_community_spaces_host   ON community_spaces(host_id);
CREATE INDEX IF NOT EXISTS idx_community_spaces_server ON community_spaces(server_id);

CREATE TABLE IF NOT EXISTS community_space_participants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id   uuid NOT NULL REFERENCES community_spaces(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role       community_space_role NOT NULL DEFAULT 'LISTENER',
  joined_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_space_participants_space ON community_space_participants(space_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_space_participants_unique ON community_space_participants(space_id, user_id);

-- RLS
ALTER TABLE community_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_space_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_spaces_select_auth ON community_spaces;
CREATE POLICY community_spaces_select_auth ON community_spaces FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS community_spaces_insert_host ON community_spaces;
CREATE POLICY community_spaces_insert_host ON community_spaces FOR INSERT TO authenticated WITH CHECK (host_id = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS community_spaces_update_host ON community_spaces;
CREATE POLICY community_spaces_update_host ON community_spaces FOR UPDATE TO authenticated USING (host_id = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS community_spaces_delete_host ON community_spaces;
CREATE POLICY community_spaces_delete_host ON community_spaces FOR DELETE TO authenticated USING (host_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS space_participants_select_auth ON community_space_participants;
CREATE POLICY space_participants_select_auth ON community_space_participants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS space_participants_insert_own ON community_space_participants;
CREATE POLICY space_participants_insert_own ON community_space_participants FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS space_participants_update_own ON community_space_participants;
CREATE POLICY space_participants_update_own ON community_space_participants FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS space_participants_delete_own ON community_space_participants;
CREATE POLICY space_participants_delete_own ON community_space_participants FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()::text));

-- Realtime: stream live list + roster changes to clients.
ALTER TABLE community_space_participants REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE community_spaces;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE community_space_participants;
EXCEPTION WHEN duplicate_object THEN null; END $$;
