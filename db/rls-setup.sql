-- ============================================================
-- RLS + REALTIME SETUP
-- auth.uid()::text = better-auth user ID (sub from custom JWT)
-- ============================================================


-- ============================================================
-- AUTH TABLES
-- ============================================================

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own" ON "user" FOR SELECT TO authenticated USING (id = auth.uid()::text);
CREATE POLICY "users_update_own" ON "user" FOR UPDATE TO authenticated USING (id = auth.uid()::text);

ALTER TABLE session ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_select_own" ON session FOR SELECT TO authenticated USING ("userId" = auth.uid()::text);

ALTER TABLE account ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_select_own" ON account FOR SELECT TO authenticated USING ("userId" = auth.uid()::text);

ALTER TABLE passkey ENABLE ROW LEVEL SECURITY;
CREATE POLICY "passkeys_select_own" ON passkey FOR SELECT TO authenticated USING ("userId" = auth.uid()::text);

-- server-only, no client access
ALTER TABLE verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_nft_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrows ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- MESSAGING TABLES
-- ============================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_select_participant"
  ON conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversations.id
        AND cp.user_id = auth.uid()::text
    )
  );

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants_select_own_conversations"
  ON conversation_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
        AND cp.user_id = auth.uid()::text
    )
  );

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select_participant"
  ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()::text
    )
  );

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions_select_participant"
  ON message_reactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND cp.user_id = auth.uid()::text
    )
  );

ALTER TABLE message_read_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_receipts_select_participant"
  ON message_read_receipts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_read_receipts.message_id
        AND cp.user_id = auth.uid()::text
    )
  );

ALTER TABLE user_encryption_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "encryption_keys_select_authenticated"
  ON user_encryption_keys FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "encryption_keys_manage_own"
  ON user_encryption_keys FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);


-- ============================================================
-- CONTENT TABLES
-- ============================================================

ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tokens_public_read"
  ON tokens FOR SELECT TO authenticated, anon
  USING (true);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "videos_public_read"
  ON videos FOR SELECT TO authenticated, anon
  USING (visibility = 'public' AND status = 'ready');
CREATE POLICY "videos_owner_read_all"
  ON videos FOR SELECT TO authenticated
  USING ("userId" = auth.uid()::text);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts_public_read"
  ON posts FOR SELECT TO authenticated, anon
  USING (visibility = 'public' AND status = 'published');
CREATE POLICY "posts_owner_read_all"
  ON posts FOR SELECT TO authenticated
  USING ("userId" = auth.uid()::text);

ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "playlists_public_read"
  ON playlists FOR SELECT TO authenticated, anon
  USING (visibility = 'public');
CREATE POLICY "playlists_owner_read_all"
  ON playlists FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

ALTER TABLE playlist_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "playlist_videos_read"
  ON playlist_videos FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM playlists p
      WHERE p.id = playlist_videos.playlist_id
        AND (p.visibility = 'public' OR p.user_id = auth.uid()::text)
    )
  );


-- ============================================================
-- REALTIME — remove sensitive tables, keep only messaging
-- ============================================================

-- Remove auth tables that should never stream to clients
ALTER PUBLICATION supabase_realtime DROP TABLE "user";
ALTER PUBLICATION supabase_realtime DROP TABLE session;
ALTER PUBLICATION supabase_realtime DROP TABLE account;
ALTER PUBLICATION supabase_realtime DROP TABLE passkey;
ALTER PUBLICATION supabase_realtime DROP TABLE verification;
ALTER PUBLICATION supabase_realtime DROP TABLE encrypted_wallets;
ALTER PUBLICATION supabase_realtime DROP TABLE wallet_access_log;

-- NOTE: `posts` intentionally STAYS in the publication. The browse feed
-- (components/browse/browse-feed.tsx) subscribes to UPDATE on `posts` to push
-- live engagement counts (likes/reposts/comments/views). RLS still gates rows.
-- Do not drop it — doing so silently breaks real-time feed engagement.

-- Messaging tables already in the publication — no ADD needed

-- Community chat: stream message inserts/updates/deletes to channel subscribers.
-- REPLICA IDENTITY FULL so UPDATE/DELETE payloads include the row's channel_id
-- (needed for client-side channel filtering on edits + soft-deletes).
ALTER TABLE community_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE community_messages;
