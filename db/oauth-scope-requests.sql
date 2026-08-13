-- OAuth privileged-scope review queue (2026-08-12): before an app can be
-- granted a PRIVILEGED OAuth scope, a human reviews the request. The generic
-- infrastructure — the queue, the admin review, the fail-closed gate — ships
-- now; the set of privileged scopes is config (lib/developer/oauth-scopes.ts
-- PRIVILEGED_SCOPES), EMPTY today, so nothing is gated until the first
-- privileged scope + its enforcing endpoint is defined.
--
-- Fail-closed: an approved request ADDS the scope to the app's oauthClient
-- scopes allow-list; until then the OAuth provider rejects it at authorize
-- (client.scopes is the enforcing gate — already live). Additive, both
-- Supabase projects.

create table if not exists oauth_scope_requests (
  id             text primary key,
  -- The developer app requesting the scope (developer_apps.id).
  app_id         text not null references developer_apps(id) on delete cascade,
  -- The owner who made the request (audit; RLS gate).
  user_id        text not null references "user"(id) on delete cascade,
  -- The privileged scope requested (must be in PRIVILEGED_SCOPES).
  scope          text not null,
  -- pending | approved | rejected
  status         text not null default 'pending',
  reason         text,
  reviewed_by    text references "user"(id) on delete set null,
  reviewed_at    timestamptz,
  rejection_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_oauth_scope_requests_app on oauth_scope_requests (app_id);
create index if not exists idx_oauth_scope_requests_status on oauth_scope_requests (status);
-- One live (pending/approved) request per (app, scope) — re-requesting a
-- rejected scope is allowed, re-requesting a pending/granted one is not.
create unique index if not exists uq_oauth_scope_requests_live
  on oauth_scope_requests (app_id, scope) where status in ('pending', 'approved');

alter table oauth_scope_requests enable row level security;
-- Owners read their own requests; approvals/writes go through the service role
-- (tRPC), so this policy is the read gate + defense-in-depth.
drop policy if exists oauth_scope_requests_own on oauth_scope_requests;
create policy oauth_scope_requests_own on oauth_scope_requests
  for all to authenticated
  using (user_id = (select auth.uid()::text));
