import { pgTable, text, doublePrecision, timestamp, index, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Address → chain + pool, for coins nobody here tracks.
 *
 * The point is the MAPPING, not the market data. An address's chain and deepest
 * pool essentially never change, so resolving one is a permanent answer — but
 * before this it lived in a 15-minute cache entry, which meant a coin someone
 * links to repeatedly cost an upstream call every quarter hour, forever.
 *
 * This is deliberately not `tracked_tokens`: that table is the alert feed's
 * WORK QUEUE (scan cursors, staleness sweep, per-coin budget), and adding rows
 * to it for anything a user happened to open would put them in the scan
 * rotation and dilute the alert budget. Same shape of data, completely
 * different lifecycle.
 *
 * The market columns are a snapshot from whenever we last resolved, shown while
 * the view's own live queries load. They are not kept fresh — nothing sweeps
 * this table, by design.
 */
export const coinIndex = pgTable(
    "coin_index",
    {
        /** `${network}:${tokenAddress}` — same convention as tracked_tokens. */
        id: text("id").primaryKey(),
        network: text("network").notNull(),
        tokenAddress: text("token_address").notNull(),
        poolAddress: text("pool_address").notNull(),
        dexId: text("dex_id"),

        symbol: text("symbol").notNull(),
        name: text("name"),
        imageUrl: text("image_url"),

        priceUsd: doublePrecision("price_usd"),
        marketCapUsd: doublePrecision("market_cap_usd"),
        liquidityUsd: doublePrecision("liquidity_usd"),
        volume24hUsd: doublePrecision("volume_24h_usd"),
        priceChange24h: doublePrecision("price_change_24h"),
        buys24h: doublePrecision("buys_24h"),
        sells24h: doublePrecision("sells_24h"),

        /** Which upstream answered — so a bad source can be re-resolved later
         *  without wiping rows that came from a good one. */
        source: text("source").notNull(),
        resolvedAt: timestamp("resolved_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
        // The lookup is BY ADDRESS: the URL carries an address and, usually, no
        // chain. Not unique — the same address exists on several chains.
        index("coin_index_token_address_idx").on(t.tokenAddress),
        // Server-only: read through postgres (bypasses RLS); the API roles get
        // nothing (db/enable-rls-coin-tables.sql, 2026-10-01).
        pgPolicy("coin_index_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
    ],
).enableRLS();
