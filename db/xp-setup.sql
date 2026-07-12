-- ============================================================
-- XP / leveling core — additive, idempotent. Safe on the shared
-- dev == prod Supabase DB; reversible via DROP TABLE / DROP COLUMN.
-- Run by hand, not via drizzle push. Mirrors db/schema/content/xp.ts
-- and the xp/level columns in db/schema/auth/user.ts.
-- Design doc: docs/exp-callouts.md (Phase 1).
-- ============================================================

-- ── Append-only XP ledger ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "xp_events" (
  "id"        text PRIMARY KEY,
  "userId"    text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "kind"      text NOT NULL,
  "refId"     text NOT NULL,
  "amount"    integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
-- Idempotency: one award per (user, kind, ref) — retries can't double-award.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_xp_events_dedupe" ON "xp_events" ("userId", "kind", "refId");
-- Daily-cap checks + profile history read path.
CREATE INDEX IF NOT EXISTS "idx_xp_events_user_time" ON "xp_events" ("userId", "createdAt");

ALTER TABLE "xp_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "xp_events_select_own" ON "xp_events";
CREATE POLICY "xp_events_select_own" ON "xp_events" FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid()::text));

-- ── Denormalized rollups on user ─────────────────────────────────────────────
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "xp" integer DEFAULT 0 NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "level" integer DEFAULT 1 NOT NULL;
