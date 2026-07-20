-- ============================================================
-- Gift Premium (individual tiers, Nitro-style) — additive plus
-- one column-nullability change. Safe on the shared dev == prod
-- Supabase DB; reversible. Run by hand, not drizzle push.
-- Mirrors db/schema/content/premium.ts.
-- ============================================================

-- A gifted grant has no on-chain delegation from the recipient — these
-- were NOT NULL, which made a gift-only row impossible to insert.
ALTER TABLE "premium_subscriptions" ALTER COLUMN "subscriberWallet" DROP NOT NULL;
ALTER TABLE "premium_subscriptions" ALTER COLUMN "planPda" DROP NOT NULL;
ALTER TABLE "premium_subscriptions" ALTER COLUMN "subscriptionPda" DROP NOT NULL;
ALTER TABLE "premium_subscriptions" ALTER COLUMN "subscriptionAuthorityPda" DROP NOT NULL;
ALTER TABLE "premium_subscriptions" ALTER COLUMN "delegatorAta" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "premium_gifts" (
  "id"            text PRIMARY KEY,
  "senderId"      text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "recipientId"   text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tierKey"       text NOT NULL,
  "billingCycle"  text NOT NULL,
  "amountUsdc"    bigint NOT NULL,
  "txSignature"   text NOT NULL,
  "createdAt"     timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_premium_gifts_tx" ON "premium_gifts" ("txSignature");
CREATE INDEX IF NOT EXISTS "idx_premium_gifts_sender" ON "premium_gifts" ("senderId");
CREATE INDEX IF NOT EXISTS "idx_premium_gifts_recipient" ON "premium_gifts" ("recipientId");

ALTER TABLE "premium_gifts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "premium_gifts_select" ON "premium_gifts";
CREATE POLICY "premium_gifts_select" ON "premium_gifts" FOR SELECT TO authenticated USING ("senderId" = (SELECT auth.uid()::text) OR "recipientId" = (SELECT auth.uid()::text));
