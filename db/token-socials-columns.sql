-- Add social link columns to tokens (additive, nullable — safe per CLAUDE.md).
-- The token page previously FAKED socials from the ticker
-- (x.com/<ticker>, t.me/<ticker>, <name>.xyz); these store the real links
-- captured in the ticker dialog. Applied 2026-06-24 to the shared dev/prod DB.
ALTER TABLE public.tokens ADD COLUMN IF NOT EXISTS "twitterUrl" text;
ALTER TABLE public.tokens ADD COLUMN IF NOT EXISTS "telegramUrl" text;
ALTER TABLE public.tokens ADD COLUMN IF NOT EXISTS "websiteUrl" text;
