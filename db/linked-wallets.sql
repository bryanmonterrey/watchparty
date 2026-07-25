-- Linked Solana wallets: up to 15 per user, exactly one primary.
--
-- The user's Swig (embedded) wallet is the default primary; wallets they sign
-- in with via an extension become linked entries alongside it, and the primary
-- can be switched at will. `user.wallet_address` mirrors whichever row is
-- primary, so the ~135 existing readers of that column keep working unchanged.
--
-- Purely additive: a NEW table, safe on the shared (dev == prod) Supabase DB
-- and reversible with DROP TABLE. Run by hand, NOT via drizzle-kit push.

CREATE TABLE IF NOT EXISTS linked_wallets (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  address    text NOT NULL,
  source     text NOT NULL,
  label      text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT linked_wallets_source_check CHECK (source IN ('swig', 'extension')),
  -- A wallet belongs to exactly one account. This upholds the existing
  -- "wallet = single user" rule that sign-in already relies on.
  CONSTRAINT linked_wallets_address_unique UNIQUE (address)
);

CREATE INDEX IF NOT EXISTS idx_linked_wallets_user ON linked_wallets (user_id);

-- Exactly one primary per user, enforced by the database rather than by
-- application discipline — two primaries would make user.wallet_address
-- ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_linked_wallets_one_primary
  ON linked_wallets (user_id) WHERE is_primary;

ALTER TABLE linked_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS linked_wallets_select_own ON linked_wallets;
CREATE POLICY linked_wallets_select_own ON linked_wallets
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS linked_wallets_insert_own ON linked_wallets;
CREATE POLICY linked_wallets_insert_own ON linked_wallets
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS linked_wallets_update_own ON linked_wallets;
CREATE POLICY linked_wallets_update_own ON linked_wallets
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS linked_wallets_delete_own ON linked_wallets;
CREATE POLICY linked_wallets_delete_own ON linked_wallets
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()::text));
