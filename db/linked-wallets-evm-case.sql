-- EVM rows in linked_wallets: one canonical casing, one row per address.
--
-- Found 2026-08-19 as a duplicate in the account picker: the same 0x address
-- linked twice — once checksummed with chain_kind 'solana' (written by a
-- pre-EVM code path), once lowercase with chain_kind 'evm' (written by that
-- day's sign-in). The UNIQUE constraint on address is case-sensitive; EVM
-- addresses are case-insensitive hex, so checksummed-vs-lowercase slipped
-- straight past it. Solana addresses are case-SENSITIVE base58 and every rule
-- here is therefore scoped to rows starting 0x.
--
-- Order matters: fix kinds, then dedupe, then lowercase, then constrain.
-- Idempotent throughout. Apply to BOTH Supabase projects (see CLAUDE.md).

-- 1. A 0x address is an EVM wallet, whatever it was stamped as.
UPDATE linked_wallets SET chain_kind = 'evm'
WHERE address ILIKE '0x%' AND chain_kind IS DISTINCT FROM 'evm';

-- 2. One row per case-folded address. Keep the primary if one is; then the row
--    that knows its sign-in chain; then the newest.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY lower(address)
    ORDER BY is_primary DESC, (chain_id IS NOT NULL) DESC, created_at DESC
  ) AS rn
  FROM linked_wallets WHERE address ILIKE '0x%'
)
DELETE FROM linked_wallets WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3. Canonical form is lowercase (safe only after the dedupe above).
UPDATE linked_wallets SET address = lower(address)
WHERE address ILIKE '0x%' AND address <> lower(address);

-- 4. Make recurrence impossible, not just unlikely. Scoped to 0x so two
--    distinct Solana addresses differing only in case can never collide.
CREATE UNIQUE INDEX IF NOT EXISTS linked_wallets_evm_address_ci
  ON linked_wallets (lower(address))
  WHERE lower(address) LIKE '0x%';
