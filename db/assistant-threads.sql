-- Persistence for "ask chat" (the assistant panel).
--
-- Purely ADDITIVE: two new tables, no change to anything that exists. Safe to
-- run against the live database, and safe to run twice (IF NOT EXISTS
-- throughout). Apply to BOTH the prod project and the dev project.
--
-- Why not `drizzle-kit push`: per CLAUDE.md it can clobber the auth tables
-- ported verbatim from the old app, and on 2026-08-07 a dev-targeted push hit
-- production and dropped two tables. Schema changes ship as reviewable SQL.

CREATE TABLE IF NOT EXISTS assistant_threads (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    title       text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assistant_messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id   uuid NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
    role        text NOT NULL,
    parts       jsonb NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- The history dialog's only query: this user's threads, newest first.
CREATE INDEX IF NOT EXISTS idx_assistant_threads_user_updated
    ON assistant_threads (user_id, updated_at DESC);

-- Replaying one thread in order.
CREATE INDEX IF NOT EXISTS idx_assistant_messages_thread
    ON assistant_messages (thread_id, created_at);

-- RLS. Every query in the app goes through tRPC with an explicit user filter,
-- so these are defence in depth rather than the primary gate — but an assistant
-- thread can contain wallet balances and portfolio questions, which is exactly
-- the kind of row that must not be readable cross-tenant if a query is ever
-- written without its WHERE clause.
ALTER TABLE assistant_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_threads_own ON assistant_threads;
CREATE POLICY assistant_threads_own ON assistant_threads
    FOR ALL TO authenticated
    USING (user_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS assistant_messages_own ON assistant_messages;
CREATE POLICY assistant_messages_own ON assistant_messages
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM assistant_threads t
        WHERE t.id = assistant_messages.thread_id
          AND t.user_id = (SELECT auth.uid()::text)
    ));
