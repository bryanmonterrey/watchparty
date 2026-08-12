-- Console Agent conversations (2026-08-12): the console agent reuses the
-- assistant_threads/assistant_messages persistence stack, distinguished by an
-- additive `surface` column so console chats never appear in the app's "ask"
-- history dialog and vice versa. Purely additive, safe to run twice, apply to
-- BOTH Supabase projects.

ALTER TABLE assistant_threads
    ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'ask';

-- The rail queries one surface's threads, newest first.
CREATE INDEX IF NOT EXISTS idx_assistant_threads_user_surface_updated
    ON assistant_threads (user_id, surface, updated_at DESC);
