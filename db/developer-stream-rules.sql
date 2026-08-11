-- Filtered-stream rules per app (2026-08-11): X's Streaming Rules model.
-- Additive; mirrors db/schema/content/developer-stream-rule.ts. Apply to BOTH
-- Supabase projects.

create table if not exists developer_stream_rules (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  app_id text not null,
  value text not null,
  tag text,
  created_at timestamptz not null default now()
);

create index if not exists idx_developer_stream_rules_app on developer_stream_rules (app_id);

alter table developer_stream_rules enable row level security;

drop policy if exists developer_stream_rules_own on developer_stream_rules;
create policy developer_stream_rules_own on developer_stream_rules
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));
