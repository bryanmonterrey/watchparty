-- Developer announcements (2026-08-11): the feed behind the console's
-- Notifications page. Additive; mirrors db/schema/content/developer-announcement.ts.
-- Apply to BOTH Supabase projects.

create table if not exists developer_announcements (
  id text primary key,
  title text not null,
  body text not null,
  level text not null default 'info',
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_developer_announcements_created on developer_announcements (created_at);

alter table developer_announcements enable row level security;

drop policy if exists developer_announcements_public_read on developer_announcements;
create policy developer_announcements_public_read on developer_announcements
  for select to authenticated, anon using (true);

-- Seed one launch announcement so the feed is live, not empty.
insert into developer_announcements (id, title, body, level)
values (
  'ann_launch_platform',
  'Apps, webhooks, and scoped keys are here',
  'The developer platform now has an app registry with per-app signing identities, outbound webhooks with signed delivery, and API keys you can restrict to surface families. Streaming rules are in preview. See the docs to get started.',
  'info'
)
on conflict (id) do nothing;
