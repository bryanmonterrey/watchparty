import { pgTable, pgPolicy, text, timestamp, bigint, index } from 'drizzle-orm/pg-core';
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
