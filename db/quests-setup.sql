-- ============================================================
-- Quest progress (Phase 3 of gamification) — additive, idempotent. Safe on
-- the shared dev == prod Supabase DB; reversible via DROP TABLE. Run by hand,
-- not via drizzle push. Mirrors db/schema/content/quest.ts.
-- Design doc: docs/exp-callouts.md (Phase 3).
-- ============================================================

CREATE TABLE IF NOT EXISTS "quest_progress" (
  "id"          text PRIMARY KEY,
  "userId"      text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "questId"     text NOT NULL,
  "periodKey"   text NOT NULL,
  "progress"    integer DEFAULT 0 NOT NULL,
  "completedAt" timestamp,
  "createdAt"   timestamp DEFAULT now() NOT NULL
);
-- One row per user × quest × window; the upsert path relies on this.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_quest_progress_key" ON "quest_progress" ("userId", "questId", "periodKey");
CREATE INDEX IF NOT EXISTS "idx_quest_progress_user" ON "quest_progress" ("userId");

ALTER TABLE "quest_progress" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quest_progress_select_own" ON "quest_progress";
CREATE POLICY "quest_progress_select_own" ON "quest_progress" FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid()::text));
