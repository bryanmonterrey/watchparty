-- linked_wallets.chain_id — WHICH chain an external wallet signed in on.
--
-- `chain_kind` says "evm", which is correct and insufficient: the five EVM
-- networks share one secp256k1 address, so a Base sign-in and a
-- MetaMask-on-Ethereum sign-in are the same kind and the picker cannot tell
-- them apart to pick a logo.
--
-- Deliberately NOT backfilled. Existing rows never recorded the chain they were
-- signed in on, and guessing 1 (Ethereum) would put the wrong mark on a wallet
-- rather than no mark. NULL means "not recorded" and the UI falls back to the
-- chain-kind mark, which is what those rows already show.

BEGIN;

ALTER TABLE "linked_wallets" ADD COLUMN IF NOT EXISTS "chain_id" integer;

COMMIT;
