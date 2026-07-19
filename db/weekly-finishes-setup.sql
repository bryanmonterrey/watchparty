-- ============================================================
-- Weekly leaderboard finishes (design pass §1 prerequisite) —
-- additive, idempotent. Safe on the shared dev == prod Supabase DB;
-- reversible via DROP TABLE. Run by hand, not drizzle push.
-- Mirrors db/schema/content/weekly-finish.ts.
-- Design doc: docs/design-brief-2026-07.md §1.
-- ============================================================

CREATE TABLE IF NOT EXISTS "weekly_finishes" (
  "id"        text PRIMARY KEY,
  "userId"    text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "board"     text NOT NULL,
  "isoWeek"   text NOT NULL,
  "rank"      integer NOT NULL,
  "score"     double precision DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_weekly_finishes_key" ON "weekly_finishes" ("board", "isoWeek", "userId");
CREATE INDEX IF NOT EXISTS "idx_weekly_finishes_user" ON "weekly_finishes" ("userId");

ALTER TABLE "weekly_finishes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "weekly_finishes_select_public" ON "weekly_finishes";
CREATE POLICY "weekly_finishes_select_public" ON "weekly_finishes" FOR SELECT TO authenticated, anon USING (true);
