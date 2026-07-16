-- Community features batch 12: soundboard.
-- Short audio clips (≤10s) members play into voice channels. Slots scale with
-- boost level (lib/premium/boost-levels.ts soundSlots), enforced in the router.
-- Additive + idempotent, safe on the live DB.

CREATE TABLE IF NOT EXISTS community_sounds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    name text NOT NULL,
    emoji text,
    audio_url text NOT NULL,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_sounds_server_name UNIQUE (server_id, name)
);
CREATE INDEX IF NOT EXISTS idx_community_sounds_server ON community_sounds (server_id);

ALTER TABLE community_sounds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_sounds_select_member ON community_sounds
        FOR SELECT TO authenticated
        USING (EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text)
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Public bucket for the audio files (uploaded via signed URLs like emotes).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sounds', 'sounds', true, 2097152, ARRAY['audio/mpeg','audio/mp4','audio/ogg','audio/webm','audio/wav','audio/x-wav','audio/aac'])
ON CONFLICT (id) DO NOTHING;
