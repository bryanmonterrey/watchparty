-- ============================================================
-- Trade feed cache — additive, idempotent. Mirrors db/schema/content/token.ts.
-- Columns written by the token-stream worker; read by trade.getFeed.
-- ============================================================

ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "phase" text NOT NULL DEFAULT 'new';
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "priceUsd" double precision;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "marketCapUsd" double precision;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "volume24hUsd" double precision;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "priceChange24h" double precision;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "bondingProgress" double precision DEFAULT 0;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "txCount24h" integer DEFAULT 0;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "holderCount" integer DEFAULT 0;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "lastSyncedAt" timestamp;

CREATE INDEX IF NOT EXISTS idx_tokens_live_feed ON tokens (status, "phase");

-- Realtime: push cached market updates to all trade-feed clients.
ALTER TABLE tokens REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tokens;
EXCEPTION WHEN duplicate_object THEN null; END $$;
