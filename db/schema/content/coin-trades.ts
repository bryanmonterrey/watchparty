import { pgTable, text, doublePrecision, bigint, primaryKey, index, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Public per-pool swap log — what the transactions table under a chart reads.
 *
 * Distinct from `trades`, which is the USER-scoped table: that one is keyed to
 * a userId and only records swaps by people who opted into `shareTrades`. This
 * one records every swap on a watched pool regardless of who made it, because a
 * DEX transaction table shows the whole market, not our members.
 *
 * WHY IT EXISTS. The trades table polled GeckoTerminal every 30s behind a 30s
 * server cache — up to a minute of lag, on an upstream that rate-limits our
 * egress and so frequently returned nothing at all. Meanwhile Helius was
 * already pushing every one of these swaps to /api/webhooks/helius-trades,
 * where they were used to refresh a price row and then discarded. This table
 * writes them down; Supabase Realtime pushes them to open charts. Rows land
 * ~1-2s after the swap confirms, with no polling anywhere.
 *
 * Retention is deliberately short. This is a live tape, not an archive — the UI
 * shows the most recent trades and nothing reads back further.
 */
export const coinTrades = pgTable(
    "coin_trades",
    {
        network: text("network").notNull(),
        poolAddress: text("pool_address").notNull(),
        /** The traded token, so a table can be opened by mint without a pool. */
        tokenAddress: text("token_address").notNull(),
        /** Transaction signature — the natural dedupe key. Helius retries. */
        signature: text("signature").notNull(),
        /** Block time, unix seconds. bigint because it outlives 2038. */
        ts: bigint("ts", { mode: "number" }).notNull(),
        /** Wallet that paid for the swap. */
        trader: text("trader").notNull(),
        /** "buy" = the tracked token left the pool to the trader. */
        side: text("side").notNull(),
        /** Token amount, already scaled by decimals. */
        amountToken: doublePrecision("amount_token"),
        /** USD notional, when the other leg was SOL/USDC/USDT and priceable. */
        amountUsd: doublePrecision("amount_usd"),
        /** Execution price in USD, derived from the two legs. */
        priceUsd: doublePrecision("price_usd"),
    },
    (t) => [
        // Signature alone isn't unique: one aggregator transaction can swap
        // through several pools we watch, and each is its own row in the tape.
        primaryKey({ columns: [t.signature, t.poolAddress] }),
        // The only read: "newest N trades for this pool".
        index("coin_trades_pool_ts_idx").on(t.network, t.poolAddress, t.ts),
        // Opening a table by mint, before a pool is known.
        index("coin_trades_token_ts_idx").on(t.network, t.tokenAddress, t.ts),
        // Server-only: read through postgres (bypasses RLS); the API roles get
        // nothing (db/enable-rls-coin-tables.sql, 2026-10-01).
        pgPolicy("coin_trades_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
    ],
).enableRLS();

export type CoinTrade = typeof coinTrades.$inferSelect;
