-- Which watchparty users trade Drift perps through us, and with which wallet.
-- Foundation for the perps referral-fee sweep (reads referred users' Drift
-- UserStats fee deltas → credits referral_earnings source='perps').
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS drift_accounts (
    user_id text PRIMARY KEY,
    authority text NOT NULL,
    -- cumulative taker fees (USDC base units) at the last referral sweep
    swept_taker_fees bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE drift_accounts ENABLE ROW LEVEL SECURITY;
-- server-side only; no client policies
