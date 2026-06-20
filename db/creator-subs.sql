-- Creator subscriptions → USDC + on-chain (Solana Subscriptions program), claim
-- model. Additive only (ADD COLUMN IF NOT EXISTS) = safe on the shared dev==prod
-- DB. Mirrors db/schema/content/subscription.ts. Run by hand.

-- Treasury owns ALL plans (platform + creator), so plan ids must be globally
-- unique under the treasury wallet. Platform reserves 1–99 (lib/premium/tiers.ts);
-- creator tier plans allocate from this sequence (starts at 1000).
CREATE SEQUENCE IF NOT EXISTS premium_plan_id_seq START 1000;

-- ── subscription_tiers: USDC price + on-chain plan refs (per cycle) ──────────
ALTER TABLE "subscription_tiers"
  ADD COLUMN IF NOT EXISTS "priceUsdcMonthly"      bigint,
  ADD COLUMN IF NOT EXISTS "priceUsdcAnnual"       bigint,
  ADD COLUMN IF NOT EXISTS "planIdMonthly"         integer,
  ADD COLUMN IF NOT EXISTS "planIdAnnual"          integer,
  ADD COLUMN IF NOT EXISTS "planPdaMonthly"        text,
  ADD COLUMN IF NOT EXISTS "planPdaAnnual"         text,
  ADD COLUMN IF NOT EXISTS "createdAtChainMonthly" bigint,
  ADD COLUMN IF NOT EXISTS "createdAtChainAnnual"  bigint;

-- ── subscriptions: USDC + on-chain delegation refs (mirror premium_subscriptions) ──
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "priceUsdc"                bigint,
  ADD COLUMN IF NOT EXISTS "planId"                   integer,
  ADD COLUMN IF NOT EXISTS "planPda"                  text,
  ADD COLUMN IF NOT EXISTS "subscriberWallet"         text,
  ADD COLUMN IF NOT EXISTS "subscriptionPda"          text,
  ADD COLUMN IF NOT EXISTS "subscriptionAuthorityPda" text,
  ADD COLUMN IF NOT EXISTS "delegatorAta"             text,
  ADD COLUMN IF NOT EXISTS "lastChargeSig"            text,
  ADD COLUMN IF NOT EXISTS "lastChargeAt"             timestamp,
  ADD COLUMN IF NOT EXISTS "failedAttempts"           integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "idx_sub_due" ON "subscriptions" ("status", "currentPeriodEnd");

-- ── creator_earnings: USDC + claim tracking ─────────────────────────────────
ALTER TABLE "creator_earnings"
  ADD COLUMN IF NOT EXISTS "amountUsdc" bigint,
  ADD COLUMN IF NOT EXISTS "claimed"    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "payoutId"   text;
CREATE INDEX IF NOT EXISTS "idx_earnings_claimable" ON "creator_earnings" ("creatorId", "claimed");

-- ── payouts: USDC + fee + recipient ─────────────────────────────────────────
ALTER TABLE "payouts"
  ADD COLUMN IF NOT EXISTS "amountUsdc"      bigint,
  ADD COLUMN IF NOT EXISTS "feeUsdc"         bigint,
  ADD COLUMN IF NOT EXISTS "recipientWallet" text;
