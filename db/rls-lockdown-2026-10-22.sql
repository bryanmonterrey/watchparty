-- RLS lockdown — 2026-10-22 (security-audit run-1, verified against prod catalog)
--
-- The app reads/writes these tables only server-side with the service-role key
-- (bypasses RLS). The browser never queries them through supabase-js. But
-- /api/auth/supabase-token mints an `authenticated` JWT for every session and
-- the anon key ships in the client bundle, so any policy here is reachable
-- straight through PostgREST. Measured on prod before this file:
--   * users_select_public (TO PUBLIC USING true): anon read all 53 user rows,
--     every column — email, wallet_address, role, ban state.
--   * users_update_own + column UPDATE grant on role: self-promotion to admin.
--   * premium_sub_owner_insert/update: self-granted premium.
--   * linked_wallets_*_own: attach any address to your own account, which
--     defeats server/lib/user-wallet.ts ownsWallet().
-- Policies with NO expression (e.g. creator_earnings, payouts, streams) are
-- inert — Postgres ignores a permissive policy without a qual — so they leak
-- nothing; their write grants are revoked anyway as defence in depth.
--
-- Idempotent. Apply to BOTH projects (prod ugpzuypo…, dev hghxcuro…).

begin;

-- user: no public read, no client writes.
drop policy if exists users_select_public on public."user";
drop policy if exists users_update_own on public."user";
revoke insert, update, delete on public."user" from anon, authenticated;

-- premium entitlement is written only by the collector / verified subscribe paths.
drop policy if exists premium_sub_owner_insert on public.premium_subscriptions;
drop policy if exists premium_sub_owner_update on public.premium_subscriptions;
revoke insert, update, delete on public.premium_subscriptions from anon, authenticated;

-- wallet ownership is proven server-side (signature-verified linking) only.
drop policy if exists linked_wallets_insert_own on public.linked_wallets;
drop policy if exists linked_wallets_update_own on public.linked_wallets;
drop policy if exists linked_wallets_delete_own on public.linked_wallets;
revoke insert, update, delete on public.linked_wallets from anon, authenticated;

-- Server-owned money / unlock / key tables: no client writes, whatever the policies say.
revoke insert, update, delete on
  public.encrypted_wallets,
  public.creator_earnings,
  public.payouts,
  public.subscriptions,
  public.post_unlocks,
  public.dm_unlocks,
  public.referrals,
  public.referral_earnings,
  public.gift_subscriptions,
  public.premium_gifts
from anon, authenticated;

commit;
