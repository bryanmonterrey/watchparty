-- Chat name colour, chosen from the Identity panel in live chat.
--
-- Additive and nullable, per the repo's rule for a DB that dev and prod share:
-- NULL means "never picked one", and the client falls back to the deterministic
-- colour hashed from the user id (lib/chat/chat-name-color.ts). So this column
-- being empty is the normal state, not a missing value to backfill.
--
-- Separate from user."accentColor", which is the vertical bar on the profile
-- page — a different surface with a different meaning, and the two shouldn't be
-- forced to move together.
--
-- Applied 2026-08-04.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "chatColor" text;
