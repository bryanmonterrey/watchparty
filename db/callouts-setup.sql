-- ============================================================
-- Callouts (pump.fun-style) — additive, idempotent. Safe on the shared
-- dev == prod Supabase DB; reversible via DROP TABLE. Run by hand, not
-- via drizzle push. Mirrors db/schema/content/callout.ts.
-- Design doc: docs/exp-callouts.md (Phase 2).
-- ============================================================

CREATE TABLE IF NOT EXISTS "callouts" (
  "id"              text PRIMARY KEY,
  "userId"          text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tokenId"         text NOT NULL REFERENCES "tokens"("id") ON DELETE CASCADE,
  "priceAtCall"     double precision NOT NULL,
  "marketCapAtCall" double precision,
  "peakGainPct"     double precision DEFAULT 0 NOT NULL,
  "notifiedCount"   integer DEFAULT 0 NOT NULL,
  "createdAt"       timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_callouts_user_time" ON "callouts" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_callouts_time" ON "callouts" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_callouts_token" ON "callouts" ("tokenId");

ALTER TABLE "callouts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "callouts_select_public" ON "callouts";
CREATE POLICY "callouts_select_public" ON "callouts" FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "callouts_insert_own" ON "callouts";
CREATE POLICY "callouts_insert_own" ON "callouts" FOR INSERT TO authenticated WITH CHECK ("userId" = (SELECT auth.uid()::text));
