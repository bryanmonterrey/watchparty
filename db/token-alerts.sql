-- Coin notifications (web push): per-token alert subscriptions + per-token
-- alert state used by the sync passes to decide when a push is due.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS token_alert_subscriptions (
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token_id text NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, token_id)
);
CREATE INDEX IF NOT EXISTS idx_token_alert_subs_token ON token_alert_subscriptions (token_id);

ALTER TABLE token_alert_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY token_alert_subs_owner_all ON token_alert_subscriptions
        FOR ALL TO authenticated
        USING (user_id = (SELECT auth.uid()::text));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Price-alert baseline: the price at the last alert (or first observation).
-- A push fires when price moves ≥20% from this baseline, at most once/hour.
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "lastAlertPriceUsd" double precision;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS "lastAlertAt" timestamp;
