-- Short-window market deltas for the trade surface (Surge tab + timeframe
-- pills). Written by /api/cron/token-sync alongside the 24h aggregates.
-- Additive + nullable. Applied 2026-07-16.

ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "priceChange5m" double precision;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "priceChange1h" double precision;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "priceChange6h" double precision;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "volume5mUsd" double precision;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "volume1hUsd" double precision;
