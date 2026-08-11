-- Bot accounts (2026-08-11, phase 8): each developer app can have one bot user.
-- Additive; mirrors db/schema/content/developer-bot.ts + the user.is_bot column.
-- Apply to BOTH Supabase projects.

alter table "user" add column if not exists is_bot boolean not null default false;

create table if not exists developer_bots (
  bot_user_id text primary key references "user"(id) on delete cascade,
  app_id text not null unique references developer_apps(id) on delete cascade,
  owner_id text not null references "user"(id) on delete cascade,
  key_id text not null unique,
  created_at timestamptz not null default now()
);

alter table developer_bots enable row level security;

drop policy if exists developer_bots_owner on developer_bots;
create policy developer_bots_owner on developer_bots
  for all to authenticated
  using (owner_id = (select auth.uid()::text))
  with check (owner_id = (select auth.uid()::text));
