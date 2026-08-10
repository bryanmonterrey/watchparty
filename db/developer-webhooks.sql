-- Developer webhooks (2026-08-10): one outbound endpoint per account plus a
-- metadata-only delivery log. Additive; mirrors
-- db/schema/content/developer-webhook.ts. Apply to BOTH Supabase projects
-- (prod + dev), per the schema-changes rule in CLAUDE.md.

create table if not exists developer_webhooks (
  user_id text primary key references "user"(id) on delete cascade,
  url text not null,
  secret text not null,
  events text[] not null default '{}'::text[],
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table developer_webhooks enable row level security;

drop policy if exists developer_webhooks_own on developer_webhooks;
create policy developer_webhooks_own on developer_webhooks
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));

create table if not exists developer_webhook_deliveries (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  event text not null,
  status integer,
  ok boolean not null,
  duration_ms integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dev_webhook_deliveries_user
  on developer_webhook_deliveries (user_id, created_at);

alter table developer_webhook_deliveries enable row level security;

drop policy if exists developer_webhook_deliveries_own_read on developer_webhook_deliveries;
create policy developer_webhook_deliveries_own_read on developer_webhook_deliveries
  for select to authenticated
  using (user_id = (select auth.uid()::text));
