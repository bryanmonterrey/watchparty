-- Broadcast history (2026-08-11): one row per go-live→offline, for the studio
-- Producer/Broadcasts list. Additive; mirrors db/schema/content/stream-session.ts.
-- Apply to BOTH Supabase projects.

create table if not exists stream_sessions (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  title text,
  category text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_stream_sessions_user on stream_sessions (user_id, started_at);

alter table stream_sessions enable row level security;

drop policy if exists stream_sessions_own_read on stream_sessions;
create policy stream_sessions_own_read on stream_sessions
  for select to authenticated
  using (user_id = (select auth.uid()::text));
