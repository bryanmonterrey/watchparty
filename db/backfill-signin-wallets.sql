-- Backfill (2026-08-19): accounts that signed in with an EVM wallet BEFORE
-- linkSignInWallet shipped (03116bde, deployed midday 2026-08-19) have their
-- sign-in wallet in better-auth's "walletAddress" table but not in
-- linked_wallets — so the account picker doesn't show the wallet they signed
-- in with. Insert the missing rows the way linkSignInWallet would have:
-- lowercased EVM address, source extension, chain_id from the SIWE row,
-- never stealing primary from an existing wallet.
--
-- Idempotent: the not-exists guard makes re-runs no-ops.
insert into linked_wallets (id, user_id, address, source, chain_kind, chain_id, is_primary, created_at)
select gen_random_uuid()::text, w."userId", lower(w.address), 'extension', 'evm', w."chainId",
       not exists (select 1 from linked_wallets p where p.user_id = w."userId" and p.is_primary),
       now()
from "walletAddress" w
where not exists (
  select 1 from linked_wallets lw
  where lw.user_id = w."userId" and lower(lw.address) = lower(w.address)
);

-- And fill in the sign-in chain hint on rows linked before chain_id existed,
-- from the SIWE row that recorded it. Only where we don't already know it.
update linked_wallets lw
set chain_id = w."chainId"
from "walletAddress" w
where lw.user_id = w."userId"
  and lower(lw.address) = lower(w.address)
  and lw.chain_kind = 'evm'
  and lw.chain_id is null
  and w."chainId" is not null;
