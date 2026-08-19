-- linked_wallets.chain_kind — which chain a linked wallet is ON.
--
-- The table was Solana-only by construction, so every existing row is a Solana
-- wallet and `user.wallet_address` could just mirror the primary's address.
-- That stops being true the moment someone signs in with Base: an external EVM
-- wallet is a wallet, it is the wallet in use, and it has no Solana address.
--
-- NULL means MULTICHAIN and is only ever the generated ("swig") wallet — one
-- wallet with an address on every chain kind, in `wallet_addresses`. An
-- external wallet names its single chain.
--
-- Backfill therefore splits by source rather than blanket-setting 'solana':
-- extension rows are Solana wallets (nothing else could have been linked yet),
-- swig rows are multichain and must stay NULL, or the generated wallet would
-- start claiming to be Solana-only and stop resolving its EVM address.
--
-- Additive and nullable. Safe on a running deploy: code that does not know the
-- column ignores it, and code that does treats NULL as multichain, which is
-- what every pre-existing swig row is.

BEGIN;

ALTER TABLE "linked_wallets" ADD COLUMN IF NOT EXISTS "chain_kind" text;

UPDATE "linked_wallets" SET "chain_kind" = 'solana'
WHERE "source" = 'extension' AND "chain_kind" IS NULL;

COMMIT;
