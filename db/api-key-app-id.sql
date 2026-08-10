-- Per-app API key association (2026-08-10, phase 2a): additive nullable column
-- linking a key to a developer app. Account-level keys keep app_id NULL and
-- stay valid. Mirrors db/schema/content/api-key.ts. Apply to BOTH Supabase
-- projects.

alter table api_keys
  add column if not exists app_id text
  references developer_apps(id) on delete set null;

create index if not exists idx_api_keys_app on api_keys (app_id);
