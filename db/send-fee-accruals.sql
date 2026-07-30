-- Platform fees owed on EVM sends, waiting to be swept.
--
-- Purely additive: a NEW table, no changes to existing ones, so it is safe on
-- the shared (dev == prod) Supabase DB and reversible with DROP TABLE. Run by
-- hand — NOT via drizzle-kit push, which can clobber the ported auth tables.
--
-- Why a ledger exists at all: Solana takes the 0.5% fee as another instruction
-- and Bitcoin as another output, both inside the user's own transaction. An EVM
-- transfer pays exactly one address, so the fee is recorded here and collected
-- by app/api/cron/send-fee-sweep — one transaction per (wallet, chain, token)
-- per run instead of a second transaction on every send.
--
-- `amount` is text, not numeric: it holds base units of the sent asset, and an
-- 18-decimal token overflows a JS number on the way in or out.

CREATE TABLE IF NOT EXISTS send_fee_accruals (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  chain       text NOT NULL,
  contract    text,
  amount      text NOT NULL,
  source_tx   text,
  status      text NOT NULL DEFAULT 'pending',
  swept_tx    text,
  last_error  text,
  created_at  timestamp NOT NULL DEFAULT now(),
  swept_at    timestamp,
  CONSTRAINT send_fee_accruals_status_check
    CHECK (status IN ('pending', 'swept', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_send_fee_accruals_pending
  ON send_fee_accruals (status, user_id);
CREATE INDEX IF NOT EXISTS idx_send_fee_accruals_user
  ON send_fee_accruals (user_id);

ALTER TABLE send_fee_accruals ENABLE ROW LEVEL SECURITY;

-- Read-only to the owner. Rows are written by the server when a send lands and
-- settled by the sweep; a user editing what they owe would defeat the point.
DROP POLICY IF EXISTS send_fee_accruals_select_own ON send_fee_accruals;
CREATE POLICY send_fee_accruals_select_own ON send_fee_accruals
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));
