-- Referral rewards: referrers earn 10% of their referred users' platform
-- premium payments (USDC) for the referral's first 12 months. Accrued per
-- successful charge; claimed from the treasury via the existing payout rail.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS referral_earnings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id text NOT NULL,
    referred_user_id text NOT NULL,
    amount_usdc bigint NOT NULL,          -- base units (6dp)
    source text NOT NULL DEFAULT 'premium',
    -- idempotency: one credit per charge (charge signature or sub+period key)
    reference text NOT NULL UNIQUE,
    claimed_at timestamptz,
    claim_signature text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer ON referral_earnings (referrer_id, claimed_at);

ALTER TABLE referral_earnings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY referral_earnings_owner_read ON referral_earnings
        FOR SELECT TO authenticated
        USING (referrer_id = (SELECT auth.uid()::text));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
