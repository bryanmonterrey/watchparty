-- Profile accent color (2026-07-21): Twitch-style vertical brand bar on the
-- right edge of the profile page. Hex string, null = no bar. Additive only.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "accentColor" text;
