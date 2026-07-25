-- Multichain account addresses, derived from each account's single BIP39 phrase.
--
-- Purely additive: a NEW table, no changes to existing ones, so it is safe on
-- the shared (dev == prod) Supabase DB and reversible with DROP TABLE. Run by
-- hand — NOT via drizzle-kit push, which can clobber the ported auth tables.
--
-- Keyed by chain KIND rather than chain id, because the five EVM networks
-- (Ethereum, Base, Polygon, HyperEVM, Robinhood) all share one secp256k1
-- address. Kind → chain list resolves in lib/chains/registry.ts.

CREATE TABLE IF NOT EXISTS wallet_addresses (
  id              text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  chain_kind      text NOT NULL,
  address         text NOT NULL,
  derivation_path text NOT NULL,
  created_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT wallet_addresses_user_kind_unique UNIQUE (user_id, chain_kind),
  CONSTRAINT wallet_addresses_kind_check
    CHECK (chain_kind IN ('solana', 'evm', 'bitcoin', 'sui'))
);

CREATE INDEX IF NOT EXISTS idx_wallet_addresses_user    ON wallet_addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_address ON wallet_addresses (address);

ALTER TABLE wallet_addresses ENABLE ROW LEVEL SECURITY;

-- Mirrors the encrypted_wallets policies: a user reaches only their own rows.
DROP POLICY IF EXISTS wallet_addresses_select_own ON wallet_addresses;
CREATE POLICY wallet_addresses_select_own ON wallet_addresses
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS wallet_addresses_insert_own ON wallet_addresses;
CREATE POLICY wallet_addresses_insert_own ON wallet_addresses
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS wallet_addresses_update_own ON wallet_addresses;
CREATE POLICY wallet_addresses_update_own ON wallet_addresses
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS wallet_addresses_delete_own ON wallet_addresses;
CREATE POLICY wallet_addresses_delete_own ON wallet_addresses
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()::text));
