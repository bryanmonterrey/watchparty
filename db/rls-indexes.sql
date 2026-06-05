-- ============================================================
-- PERFORMANCE: Re-create RLS policies using (SELECT auth.uid())
-- to prevent the function being re-evaluated per row, and add
-- indexes on all columns referenced in RLS policy WHERE clauses.
-- ============================================================


-- ============================================================
-- DROP & RECREATE POLICIES WITH (SELECT auth.uid()::text)
-- ============================================================

-- user
DROP POLICY IF EXISTS "users_select_own" ON "user";
DROP POLICY IF EXISTS "users_update_own" ON "user";
CREATE POLICY "users_select_own" ON "user" FOR SELECT TO authenticated USING (id = (SELECT auth.uid()::text));
CREATE POLICY "users_update_own" ON "user" FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()::text));

-- session
DROP POLICY IF EXISTS "sessions_select_own" ON session;
CREATE POLICY "sessions_select_own" ON session FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid()::text));

-- account
DROP POLICY IF EXISTS "accounts_select_own" ON account;
CREATE POLICY "accounts_select_own" ON account FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid()::text));

-- passkey
DROP POLICY IF EXISTS "passkeys_select_own" ON passkey;
CREATE POLICY "passkeys_select_own" ON passkey FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid()::text));

-- conversations
DROP POLICY IF EXISTS "conversations_select_participant" ON conversations;
CREATE POLICY "conversations_select_participant"
  ON conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversations.id
        AND cp.user_id = (SELECT auth.uid()::text)
    )
  );

-- conversation_participants
DROP POLICY IF EXISTS "participants_select_own_conversations" ON conversation_participants;
CREATE POLICY "participants_select_own_conversations"
  ON conversation_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
        AND cp.user_id = (SELECT auth.uid()::text)
    )
  );

-- messages
DROP POLICY IF EXISTS "messages_select_participant" ON messages;
CREATE POLICY "messages_select_participant"
  ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = (SELECT auth.uid()::text)
    )
  );

-- message_reactions
DROP POLICY IF EXISTS "reactions_select_participant" ON message_reactions;
CREATE POLICY "reactions_select_participant"
  ON message_reactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND cp.user_id = (SELECT auth.uid()::text)
    )
  );

-- message_read_receipts
DROP POLICY IF EXISTS "read_receipts_select_participant" ON message_read_receipts;
CREATE POLICY "read_receipts_select_participant"
  ON message_read_receipts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_read_receipts.message_id
        AND cp.user_id = (SELECT auth.uid()::text)
    )
  );

-- user_encryption_keys
DROP POLICY IF EXISTS "encryption_keys_manage_own" ON user_encryption_keys;
CREATE POLICY "encryption_keys_manage_own"
  ON user_encryption_keys FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()::text))
  WITH CHECK (user_id = (SELECT auth.uid()::text));

-- videos
DROP POLICY IF EXISTS "videos_owner_read_all" ON videos;
CREATE POLICY "videos_owner_read_all"
  ON videos FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid()::text));

-- posts
DROP POLICY IF EXISTS "posts_owner_read_all" ON posts;
CREATE POLICY "posts_owner_read_all"
  ON posts FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid()::text));

-- playlists
DROP POLICY IF EXISTS "playlists_owner_read_all" ON playlists;
CREATE POLICY "playlists_owner_read_all"
  ON playlists FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()::text));

-- playlist_videos
DROP POLICY IF EXISTS "playlist_videos_read" ON playlist_videos;
CREATE POLICY "playlist_videos_read"
  ON playlist_videos FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM playlists p
      WHERE p.id = playlist_videos.playlist_id
        AND (p.visibility = 'public' OR p.user_id = (SELECT auth.uid()::text))
    )
  );


-- ============================================================
-- INDEXES — auth tables (camelCase columns)
-- ============================================================

-- session lookups by user
CREATE INDEX IF NOT EXISTS idx_session_userid ON session ("userId");

-- account lookups by user
CREATE INDEX IF NOT EXISTS idx_account_userid ON account ("userId");

-- passkey lookups by user
CREATE INDEX IF NOT EXISTS idx_passkey_userid ON passkey ("userId");

-- user wallet address (SIWS upsert + RLS)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallet_address ON "user" (wallet_address)
  WHERE wallet_address IS NOT NULL;

-- user username (search queries)
CREATE INDEX IF NOT EXISTS idx_user_username ON "user" (username)
  WHERE username IS NOT NULL;


-- ============================================================
-- INDEXES — messaging tables (snake_case columns)
-- ============================================================

-- The most critical: every RLS policy checks this
CREATE INDEX IF NOT EXISTS idx_cp_user_id ON conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_cp_conversation_id ON conversation_participants (conversation_id);
-- Composite for the self-join in participants policy
CREATE INDEX IF NOT EXISTS idx_cp_conv_user ON conversation_participants (conversation_id, user_id);

-- messages by conversation (RLS + feed queries)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at DESC);

-- reactions by message
CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON message_reactions (message_id);

-- read receipts by message
CREATE INDEX IF NOT EXISTS idx_read_receipts_message_id ON message_read_receipts (message_id);


-- ============================================================
-- INDEXES — content tables
-- ============================================================

-- videos by user + visibility filter (RLS + feed)
CREATE INDEX IF NOT EXISTS idx_videos_userid ON videos ("userId");
CREATE INDEX IF NOT EXISTS idx_videos_visibility_status ON videos (visibility, status);

-- posts by user + visibility filter (RLS + feed)
CREATE INDEX IF NOT EXISTS idx_posts_userid ON posts ("userId");
CREATE INDEX IF NOT EXISTS idx_posts_visibility_status ON posts (visibility, status);

-- tokens by creator
CREATE INDEX IF NOT EXISTS idx_tokens_creatorid ON tokens ("creatorId");
