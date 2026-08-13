-- Developer Projects (2026-08-12): an organizational layer above apps — a
-- named bucket that groups apps (and, through them, keys/webhooks). Revives the
-- console's Projects nav as a real surface (it previously redirected to /apps).
--
-- Deliberately ORG-ONLY for now: `plan` is an inert stub ('pay_per_use') so the
-- console can render X's plan chip and paid tiers can activate later WITHOUT a
-- schema change. Money + entitlements still live at the ACCOUNT level — a
-- project grants nothing, gates nothing; it only labels.
--
-- Additive + reversible: a new table plus one nullable FK column on
-- developer_apps. Apply to BOTH Supabase projects.

create table if not exists developer_projects (
  id          text primary key,
  owner_id    text not null references "user"(id) on delete cascade,
  name        text not null,
  -- Inert plan stub. Real tiers layer on later; today every project reads
  -- 'pay_per_use' and it changes nothing.
  plan        text not null default 'pay_per_use',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_developer_projects_owner on developer_projects (owner_id);

alter table developer_projects enable row level security;
drop policy if exists developer_projects_own on developer_projects;
create policy developer_projects_own on developer_projects
  for all to authenticated
  using (owner_id = (select auth.uid()::text));

-- An app optionally belongs to one project. ON DELETE SET NULL: deleting a
-- project un-files its apps (the apps survive — a project is a label, not an
-- owner). Nullable, so every existing app is simply "unfiled" until moved.
alter table developer_apps
  add column if not exists project_id text references developer_projects(id) on delete set null;

create index if not exists idx_developer_apps_project on developer_apps (project_id);
