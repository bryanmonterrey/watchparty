-- 2026-10-01: the last four public tables without row-level security —
-- coin_candles, coin_index, coin_trades (the coin feed's cache, written by
-- the cron worker) and post_tags. Supabase's advisor flags them because the
-- anon/authenticated API roles could read them through PostgREST. Nothing of
-- ours reads them that way: the app and the crons connect as `postgres`,
-- which bypasses RLS (verified: postgres and service_role have
-- rolbypassrls = true; anon and authenticated do not), so this changes
-- nothing for the app and closes the API-side exposure. Same deny policy as
-- every other server-only table.
--
--   node scripts/db/apply-sql.mjs db/enable-rls-coin-tables.sql prod

ALTER TABLE "coin_candles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coin_candles_deny_direct_access" ON "coin_candles";
CREATE POLICY "coin_candles_deny_direct_access" ON "coin_candles" FOR ALL TO authenticated, anon USING (false);

ALTER TABLE "coin_index" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coin_index_deny_direct_access" ON "coin_index";
CREATE POLICY "coin_index_deny_direct_access" ON "coin_index" FOR ALL TO authenticated, anon USING (false);

ALTER TABLE "coin_trades" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coin_trades_deny_direct_access" ON "coin_trades";
CREATE POLICY "coin_trades_deny_direct_access" ON "coin_trades" FOR ALL TO authenticated, anon USING (false);

ALTER TABLE "post_tags" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_tags_deny_direct_access" ON "post_tags";
CREATE POLICY "post_tags_deny_direct_access" ON "post_tags" FOR ALL TO authenticated, anon USING (false);
