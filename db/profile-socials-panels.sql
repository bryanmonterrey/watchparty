-- Profile socials + channel panels (2026-07-21).
-- Additive only — applied by hand (see CLAUDE.md: no drizzle-kit push).
--
-- socials: jsonb map of platform key -> handle-or-url, rendered by
--   lib/profile/socials.ts (single source of truth for platform keys).
-- profile_panels: Twitch/Kick-style About-tab panels — user-uploaded image +
--   optional link/title/body, ordered by position.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "socials" jsonb;

CREATE TABLE IF NOT EXISTS "profile_panels" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "title" text,
    "imageUrl" text,
    "linkUrl" text,
    "body" text,
    "position" integer NOT NULL DEFAULT 0,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_profile_panels_user" ON "profile_panels"("userId");

ALTER TABLE "profile_panels" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_panels_select_public" ON "profile_panels"
    FOR SELECT TO public USING (true);
CREATE POLICY "profile_panels_insert_own" ON "profile_panels"
    FOR INSERT TO authenticated WITH CHECK ("userId" = (SELECT auth.uid()::text));
CREATE POLICY "profile_panels_update_own" ON "profile_panels"
    FOR UPDATE TO authenticated USING ("userId" = (SELECT auth.uid()::text));
CREATE POLICY "profile_panels_delete_own" ON "profile_panels"
    FOR DELETE TO authenticated USING ("userId" = (SELECT auth.uid()::text));
