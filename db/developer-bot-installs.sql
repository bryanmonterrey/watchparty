-- Bot community installs (2026-08-11, phase 8): where a bot is installed and
-- what it may do there (permissions bitfield, see lib/developer/bot-permissions.ts).
-- Additive; mirrors db/schema/content/developer-bot-install.ts. Apply to BOTH
-- Supabase projects. Server-side-only (no RLS policy — reached solely via tRPC).

create table if not exists developer_bot_installs (
  id uuid primary key default gen_random_uuid(),
  bot_user_id text not null references "user"(id) on delete cascade,
  server_id uuid not null references community_servers(id) on delete cascade,
  permissions integer not null default 0,
  installed_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_developer_bot_installs_bot_server
  on developer_bot_installs (bot_user_id, server_id);
create index if not exists idx_developer_bot_installs_server
  on developer_bot_installs (server_id);

alter table developer_bot_installs enable row level security;
