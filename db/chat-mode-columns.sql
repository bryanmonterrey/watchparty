-- Chat gating per channel: who may talk, and how long they must have followed.
--
-- Additive and nullable with defaults, per the rule for a DB dev and prod
-- share. 'everyone' + 0 is the behaviour every existing channel already has, so
-- backfill is a no-op and nothing changes for anyone until a host opts in.
--
-- On `streams` rather than a new table because it is already one row per
-- channel, keyed by userId, and this is channel configuration.
--
-- Applied 2026-08-05.

ALTER TABLE "streams" ADD COLUMN IF NOT EXISTS "chatMode" text NOT NULL DEFAULT 'everyone';
ALTER TABLE "streams" ADD COLUMN IF NOT EXISTS "chatFollowerMinutes" integer NOT NULL DEFAULT 0;
