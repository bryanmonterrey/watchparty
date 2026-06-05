-- Creates the `walletAddress` table required by better-auth's SIWE plugin
-- (EVM wallet login: Ethereum, Base, Hyperliquid).
--
-- This is the ONLY schema change the reused Supabase DB needs for EVM login.
-- Every other table already exists (we use the full sidebar schema). Review,
-- then apply via the Supabase SQL editor or psql. Safe to re-run.

CREATE TABLE IF NOT EXISTS "walletAddress" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "address" text NOT NULL,
  "chainId" integer NOT NULL,
  "isPrimary" boolean DEFAULT false,
  "createdAt" timestamp NOT NULL,
  CONSTRAINT "walletAddress_userId_user_id_fk"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_wallet_address_user" ON "walletAddress" ("userId");

ALTER TABLE "walletAddress" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_address_select_own" ON "walletAddress";
CREATE POLICY "wallet_address_select_own" ON "walletAddress"
  FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid()::text));
