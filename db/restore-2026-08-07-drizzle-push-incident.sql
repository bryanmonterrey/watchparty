-- Restore for the 2026-08-07 drizzle-push incident.
--
-- What happened: scripts/db/setup-dev-db.mjs ran `drizzle-kit push` intending
-- the fresh DEV project, but drizzle.config.ts loads .env.local with
-- override:true AFTER the script's env injection — and .env.local carried the
-- PRODUCTION DIRECT_URL. Push (with --force) applied its drift plan to prod:
-- dropped two tables not in the drizzle schema graph, disabled RLS on two
-- tables, dropped three policies, and churned ~67 constraints (most re-added
-- under drizzle's names; the ones below were not).
--
-- This file restores everything except the two tables (their own canonical
-- files are replayed alongside: feed-embeddings.sql, coin-trades.sql,
-- coin-trades-realtime.sql, community-features-2.sql, community-features-3.sql).
-- Idempotent throughout — safe to re-run.

-- ── Upsert-target uniques (their ON CONFLICT writes error while missing) ────
DO $$ BEGIN
    ALTER TABLE community_channel_reads ADD CONSTRAINT uq_channel_reads_member_channel UNIQUE (member_id, channel_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE community_expressions ADD CONSTRAINT uq_expressions_server_kind_name UNIQUE (server_id, kind, name);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE community_member_roles ADD CONSTRAINT uq_member_roles UNIQUE (member_id, role_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE community_sounds ADD CONSTRAINT uq_sounds_server_name UNIQUE (server_id, name);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE community_message_reactions ADD CONSTRAINT uq_reaction_message_member_emoji UNIQUE (message_id, member_id, emoji);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE community_server_boosts ADD CONSTRAINT uq_server_boosts_server_member UNIQUE (server_id, member_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE community_bans ADD CONSTRAINT uq_bans_server_user UNIQUE (server_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE prediction_outcomes ADD CONSTRAINT uq_prediction_outcomes UNIQUE (market_id, idx);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── CHECK constraints drizzle doesn't model ─────────────────────────────────
DO $$ BEGIN
    ALTER TABLE wallet_addresses ADD CONSTRAINT wallet_addresses_kind_check
        CHECK (chain_kind IN ('solana', 'evm', 'bitcoin', 'sui'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE linked_wallets ADD CONSTRAINT linked_wallets_source_check
        CHECK (source IN ('swig', 'extension'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE send_fee_accruals ADD CONSTRAINT send_fee_accruals_status_check
        CHECK (status IN ('pending', 'swept', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS re-enable + the dropped walletAddress policy ────────────────────────
ALTER TABLE "twoFactor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walletAddress" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallet_address_select_own" ON "walletAddress";
CREATE POLICY "wallet_address_select_own" ON "walletAddress"
  FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid()::text));
-- (community_message_reactions_select / community_server_boosts_select come
-- back from replaying community-features-2.sql / -3.sql, which guard with
-- duplicate_object handlers.)
