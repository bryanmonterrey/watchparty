-- Predictions v1: in-house pari-mutuel markets, USDC, on watchparty's own
-- treasury rails (bets in via verified on-chain transfer like boost packs;
-- payouts out via the creator-claims payout float). No third-party protocol.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS prediction_markets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question text NOT NULL,
    description text,
    category text NOT NULL DEFAULT 'general',
    image_url text,
    creator_id text NOT NULL,
    -- betting cutoff; after this no new bets
    closes_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'open', -- open | resolved | voided
    winning_outcome integer,             -- outcomes.idx when resolved
    resolved_at timestamptz,
    resolution_note text,
    fee_bps integer NOT NULL DEFAULT 500, -- rake on the LOSING pool only
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prediction_markets_status ON prediction_markets (status, closes_at);

CREATE TABLE IF NOT EXISTS prediction_outcomes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id uuid NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
    idx integer NOT NULL,
    label text NOT NULL,
    -- denormalized pool total in USDC base units (6dp), bumped per bet
    pool_usdc bigint NOT NULL DEFAULT 0,
    CONSTRAINT uq_prediction_outcomes UNIQUE (market_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_market ON prediction_outcomes (market_id);

CREATE TABLE IF NOT EXISTS prediction_bets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id uuid NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
    outcome_idx integer NOT NULL,
    user_id text NOT NULL,
    amount_usdc bigint NOT NULL,          -- base units
    tx_signature text NOT NULL UNIQUE,    -- one on-chain payment = one bet
    payout_usdc bigint,                   -- set on claim (or refund on void)
    claim_signature text,                 -- treasury payout tx
    claimed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prediction_bets_market ON prediction_bets (market_id);
CREATE INDEX IF NOT EXISTS idx_prediction_bets_user ON prediction_bets (user_id);

ALTER TABLE prediction_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_bets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY prediction_markets_public_read ON prediction_markets
        FOR SELECT TO authenticated, anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY prediction_outcomes_public_read ON prediction_outcomes
        FOR SELECT TO authenticated, anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY prediction_bets_owner_read ON prediction_bets
        FOR SELECT TO authenticated
        USING (user_id = (SELECT auth.uid()::text));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
