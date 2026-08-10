-- API key scopes (2026-08-10, phase 2b): additive nullable array of surface
-- families (coins/content/social/charts/rpc/preview/rest). NULL = unscoped =
-- full access, so every existing key is unaffected. The edge gate enforces
-- via a Redis mirror (apigate:scope:<id>) written only for restricted keys.
-- Mirrors db/schema/content/api-key.ts. Apply to BOTH Supabase projects.

alter table api_keys
  add column if not exists scopes text[];
