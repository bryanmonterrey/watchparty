import { pgTable, pgPolicy, text, timestamp, bigint, index, date, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from '../auth/user';

// Credits-backed API keys for external (non-app) callers — the hybrid x402
// model: anonymous callers may pay per request via an X-PAYMENT header,
// integrators hold a funded key sent as x-api-key. Balances are micro-USD
// integers (1_000_000 = $1 = 1 USDC).
//
// Two things are deliberately NOT here:
//   - The key plaintext. Only sha256(full key) is stored; request-time
//     verification is HMAC(API_GATE_SECRET, id) in lib/api-gate.ts, so the
//     edge gate never needs this table at all.
//   - The live balance. Redis (apigate:bal:<id>) is the working copy the
//     gate decrements; these columns are the durable ledger, reconciled by
//     /api/cron/api-credits-flush.
export const apiKeys = pgTable('api_keys', {
    id: text('id').primaryKey(),
    userId: text('user_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    prefix: text('prefix').notNull(),
    // Optional owning app (phase 2). Nullable — account-level keys predate the
    // app registry and stay valid. developer_apps soft-deletes, so this FK's
    // set-null never actually fires, but it's the correct safety net.
    appId: text('app_id'),
    // Restricted scope families (phase 2b), from lib/api-pricing API_SCOPES.
    // NULL/empty = unscoped = full access (every pre-existing key). The edge
    // gate enforces this via a Redis mirror written only when restricted.
    scopes: text('scopes').array(),
    balanceMicro: bigint('balance_micro', { mode: 'number' }).default(0).notNull(),
    spentMicro: bigint('spent_micro', { mode: 'number' }).default(0).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, (table) => [
    index('idx_api_keys_user').on(table.userId),
    pgPolicy('api_keys_own', {
        for: 'all',
        to: 'authenticated',
        using: sql`user_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();

// Per-day spend per key — written by the flush cron as it folds Redis spend
// into the ledger. Hourly flush granularity = the chart's precision.
export const apiKeyUsageDays = pgTable('api_key_usage_days', {
    keyId: text('key_id')
        .references(() => apiKeys.id, { onDelete: 'cascade' })
        .notNull(),
    day: date('day').notNull(),
    spentMicro: bigint('spent_micro', { mode: 'number' }).default(0).notNull(),
}, (table) => [
    primaryKey({ columns: [table.keyId, table.day] }),
    pgPolicy('api_key_usage_days_own', {
        for: 'select',
        to: 'authenticated',
        using: sql`EXISTS (SELECT 1 FROM api_keys k WHERE k.id = api_key_usage_days.key_id AND k.user_id = (SELECT auth.uid()::text))`,
    }),
]).enableRLS();

// One row per redeemed USDC deposit. tx_signature as PRIMARY KEY is the
// double-spend gate (predictions-bet pattern): insert BEFORE on-chain
// verification so a replay conflicts instead of racing the verifier.
export const apiCreditDeposits = pgTable('api_credit_deposits', {
    txSignature: text('tx_signature').primaryKey(),
    keyId: text('key_id')
        .references(() => apiKeys.id, { onDelete: 'cascade' })
        .notNull(),
    amountMicro: bigint('amount_micro', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_api_credit_deposits_key').on(table.keyId),
    pgPolicy('api_credit_deposits_own', {
        for: 'select',
        to: 'authenticated',
        using: sql`EXISTS (SELECT 1 FROM api_keys k WHERE k.id = api_credit_deposits.key_id AND k.user_id = (SELECT auth.uid()::text))`,
    }),
]).enableRLS();
