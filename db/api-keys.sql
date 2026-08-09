-- External API monetization (hybrid x402 + credits-backed keys), 2026-08-09.
-- One row per issued API key. balance/spent are micro-USD integers
-- (1_000_000 = $1 = 1 USDC): Redis holds the hot working copy
-- (apigate:bal:<id>), these columns are the durable ledger, reconciled by
-- /api/cron/api-credits-flush. The key itself is never stored — only a
-- sha256 of the full plaintext; request-time verification is HMAC against
-- API_GATE_SECRET and never touches this table (lib/api-gate.ts).
-- Additive only; apply to BOTH Supabase projects (prod + dev).

create table if not exists api_keys (
    id text primary key,
    user_id text not null references "user"(id) on delete cascade,
    name text not null,
    key_hash text not null unique,
    prefix text not null,
    balance_micro bigint not null default 0,
    spent_micro bigint not null default 0,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    last_used_at timestamptz
);

create index if not exists idx_api_keys_user on api_keys(user_id);

alter table api_keys enable row level security;
create policy api_keys_own on api_keys for all to authenticated
    using (user_id = (select auth.uid()::text));
