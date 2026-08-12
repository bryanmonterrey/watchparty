-- Member timeouts (2026-08-12): the MODERATE capability's second half.
-- Additive; mirrors communityMembers.timeoutUntil in
-- db/schema/community/index.ts. Apply to BOTH Supabase projects.

alter table community_members add column if not exists timeout_until timestamptz;
