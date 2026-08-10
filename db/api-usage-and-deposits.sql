-- 402 gate, second slice (2026-08-09): per-day usage rollups + self-serve
-- USDC deposits. Additive only; apply to BOTH Supabase projects.

-- Per-day spend per key, written by /api/cron/api-credits-flush as it folds
-- Redis spend counters into the ledger. Hourly flush granularity is the
-- attribution precision — good enough for console usage charts, and the data
-- can't be backfilled, so collection starts now even though the chart UI
-- comes later.
create table if not exists api_key_usage_days (
    key_id text not null references api_keys(id) on delete cascade,
    day date not null,
    spent_micro bigint not null default 0,
    primary key (key_id, day)
);

alter table api_key_usage_days enable row level security;
create policy api_key_usage_days_own on api_key_usage_days for select to authenticated
    using (exists (select 1 from api_keys k where k.id = api_key_usage_days.key_id
                   and k.user_id = (select auth.uid()::text)));

-- One row per redeemed deposit. tx_signature as the PRIMARY KEY is the
-- double-spend gate (same pattern as predictions bets): the insert happens
-- BEFORE on-chain verification, so a second redemption of the same signature
-- conflicts instead of racing.
create table if not exists api_credit_deposits (
    tx_signature text primary key,
    key_id text not null references api_keys(id) on delete cascade,
    amount_micro bigint not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_api_credit_deposits_key on api_credit_deposits(key_id);

alter table api_credit_deposits enable row level security;
create policy api_credit_deposits_own on api_credit_deposits for select to authenticated
    using (exists (select 1 from api_keys k where k.id = api_credit_deposits.key_id
                   and k.user_id = (select auth.uid()::text)));
