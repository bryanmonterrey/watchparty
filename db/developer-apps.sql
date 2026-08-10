-- Developer app registry (2026-08-10, phase 1): the entity that owns
-- credentials and carries an Ed25519 signing identity. Additive; mirrors
-- db/schema/content/developer-app.ts. Apply to BOTH Supabase projects.

create table if not exists developer_apps (
  id text primary key,
  owner_id text not null references "user"(id) on delete cascade,
  name text not null,
  description text,
  icon_url text,
  tags text[] not null default '{}'::text[],
  public_key text not null,
  private_key_enc text not null,
  tos_url text,
  privacy_url text,
  flags bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_developer_apps_owner on developer_apps (owner_id);

alter table developer_apps enable row level security;

drop policy if exists developer_apps_own on developer_apps;
create policy developer_apps_own on developer_apps
  for all to authenticated
  using (owner_id = (select auth.uid()::text))
  with check (owner_id = (select auth.uid()::text));
