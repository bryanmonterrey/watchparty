-- Community batch 4: boost allowance ledger. Additive. Applied 2026-07-15.
--
-- Boost slots come from two sources: the user's premium tier (computed live
-- from premium_subscriptions + lib/premium/tiers.ts boostSlots — no rows here)
-- and purchased packs (rows here, granted after an on-chain USDC transfer to
-- the treasury is verified). tx_signature is UNIQUE so a transaction can only
-- ever be redeemed once.

CREATE TABLE IF NOT EXISTS community_boost_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    amount integer NOT NULL,
    source text NOT NULL DEFAULT 'purchase',
    tx_signature text UNIQUE,
    usd_paid integer,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_boost_grants_user ON community_boost_grants (user_id);

ALTER TABLE community_boost_grants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY community_boost_grants_select_own ON community_boost_grants
        FOR SELECT TO authenticated
        USING (user_id = (SELECT auth.uid()::text));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
