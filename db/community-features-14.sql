-- Community features batch 14: incoming webhooks (Discord parity — the first
-- slice of the developer platform). External services POST to a token URL and
-- the payload lands as a message in the channel. Additive + idempotent.

CREATE TABLE IF NOT EXISTS community_webhooks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL REFERENCES community_servers(id) ON DELETE CASCADE,
    channel_id uuid NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
    name text NOT NULL,
    avatar_url text,
    token text NOT NULL,
    created_by text,
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_webhooks_server ON community_webhooks (server_id);
CREATE INDEX IF NOT EXISTS idx_community_webhooks_channel ON community_webhooks (channel_id);

ALTER TABLE community_webhooks ENABLE ROW LEVEL SECURITY;
-- Tokens are secrets: no member-wide SELECT policy (server-side access only).

-- Webhook messages have no member author. Display name/avatar are denormalized
-- per message (supports per-request overrides; survives webhook deletion).
ALTER TABLE community_messages ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE community_messages
    ADD COLUMN IF NOT EXISTS webhook_id uuid REFERENCES community_webhooks(id) ON DELETE SET NULL;
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS webhook_name text;
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS webhook_avatar text;
