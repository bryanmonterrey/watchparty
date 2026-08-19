-- One-off data fix (2026-08-19): user "obama" signed in with SIWE in June,
-- BEFORE lib/auth/server.ts learned to keep EVM addresses out of
-- user.wallet_address (the SOLANA-only mirror of the primary wallet). The 0x
-- address left there feeds every base58/PublicKey reader for that account.
-- Sign-in is untouched — the address stays in better-auth's "walletAddress"
-- table, which is what SIWE resolves accounts by.
--
-- Guarded by the exact bad value so a re-run (or a run after the user gains a
-- real Solana primary) is a no-op.
update "user"
set wallet_address = null
where id = '765c3464-5bfe-4754-b848-6cdc44b0c8c7'
  and wallet_address = '0xfAb0a4cd78CE20A1E43Ce518c331FB4F3c3415cB';
