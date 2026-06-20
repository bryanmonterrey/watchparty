-- Platform premium subscriptions (the site's own paid tiers — distinct from
-- creator subscriptions). Billed in USDC, auto-recurring via the Solana
-- Subscriptions & Allowances program. Additive (new tables only) = safe on the
-- shared dev == prod Supabase DB; reversible via DROP TABLE. Run by hand, not
-- via drizzle push. Mirrors db/schema/content/premium.ts.

-- ── Merchant-published on-chain plans ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "premium_plans" (
  "id"                  text PRIMARY KEY,
  "tierKey"             text NOT NULL,
  "billingCycle"        text NOT NULL,
  "priceUsdcBaseUnits"  bigint NOT NULL,
  "planId"              integer NOT NULL,
  "planPda"             text NOT NULL,
  "collector"           text NOT NULL,
  "mint"                text NOT NULL,
  "periodHours"         integer NOT NULL,
  "createdAtChain"      bigint,
  "createdAt"           timestamp DEFAULT now() NOT NULL,
  "updatedAt"           timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_premium_plan_tier_cycle" ON "premium_plans" ("tierKey", "billingCycle");
ALTER TABLE "premium_plans" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "premium_plans_public_select" ON "premium_plans";
CREATE POLICY "premium_plans_public_select" ON "premium_plans" FOR SELECT TO authenticated, anon USING (true);

-- ── User premium subscriptions (one active row per user) ─────────────────────
CREATE TABLE IF NOT EXISTS "premium_subscriptions" (
  "id"                        text PRIMARY KEY,
  "userId"                    text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tierKey"                   text NOT NULL,
  "billingCycle"              text NOT NULL,
  "status"                    text DEFAULT 'active' NOT NULL,
  "currentPeriodStart"        timestamp NOT NULL,
  "currentPeriodEnd"          timestamp NOT NULL,
  "cancelAtPeriodEnd"         boolean DEFAULT false NOT NULL,
  "cancelledAt"               timestamp,
  "subscriberWallet"          text NOT NULL,
  "planPda"                   text NOT NULL,
  "subscriptionPda"           text NOT NULL,
  "subscriptionAuthorityPda"  text NOT NULL,
  "delegatorAta"              text NOT NULL,
  "subscribeTxSignature"      text,
  "lastChargeSig"             text,
  "lastChargeAt"              timestamp,
  "failedAttempts"            integer DEFAULT 0 NOT NULL,
  "createdAt"                 timestamp DEFAULT now() NOT NULL,
  "updatedAt"                 timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_premium_sub_user" ON "premium_subscriptions" ("userId");
CREATE INDEX IF NOT EXISTS "idx_premium_sub_due" ON "premium_subscriptions" ("status", "currentPeriodEnd");
ALTER TABLE "premium_subscriptions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "premium_sub_owner_select" ON "premium_subscriptions";
CREATE POLICY "premium_sub_owner_select" ON "premium_subscriptions" FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS "premium_sub_owner_insert" ON "premium_subscriptions";
CREATE POLICY "premium_sub_owner_insert" ON "premium_subscriptions" FOR INSERT TO authenticated WITH CHECK ("userId" = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS "premium_sub_owner_update" ON "premium_subscriptions";
CREATE POLICY "premium_sub_owner_update" ON "premium_subscriptions" FOR UPDATE TO authenticated USING ("userId" = (SELECT auth.uid()::text));

-- ── Enterprise / Custom contact-sales leads ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "premium_leads" (
  "id"        text PRIMARY KEY,
  "userId"    text REFERENCES "user"("id") ON DELETE SET NULL,
  "name"      text NOT NULL,
  "email"     text NOT NULL,
  "orgName"   text,
  "message"   text,
  "status"    text DEFAULT 'new' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_premium_leads_status" ON "premium_leads" ("status");
ALTER TABLE "premium_leads" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "premium_leads_owner_insert" ON "premium_leads";
CREATE POLICY "premium_leads_owner_insert" ON "premium_leads" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "premium_leads_owner_select" ON "premium_leads";
CREATE POLICY "premium_leads_owner_select" ON "premium_leads" FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid()::text));
