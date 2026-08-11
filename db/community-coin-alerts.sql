-- Bot-managed community coin alerts (2026-08-11, Phase 8 remainder —
-- MANAGE_COIN_ALERTS capability). Additive; mirrors communityCoinAlerts in
-- db/schema/community/index.ts. Apply to BOTH Supabase projects.

create table if not exists community_coin_alerts (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references community_servers(id) on delete cascade,
  channel_id uuid not null references community_channels(id) on delete cascade,
  token_address text not null,
  kinds text[] not null default '{}'::text[],
  created_by_bot_user_id text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_community_coin_alerts_token on community_coin_alerts (token_address);
create index if not exists idx_community_coin_alerts_server on community_coin_alerts (server_id);
create unique index if not exists idx_community_coin_alerts_unique
  on community_coin_alerts (channel_id, token_address, created_by_bot_user_id);

-- Server-only (bots via bot.* procedures) — RLS on, no policies.
alter table community_coin_alerts enable row level security;
