import { doublePrecision, index, integer, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// ─── Trending coins (the market-wide board) ───────────────────────────────────
// A refreshed cache of GeckoTerminal's trending pools across ~20 chains, behind
// the /trending page — the "overall crypto atmosphere" view.
//
// Why this is NOT `tracked_tokens`:
//   tracked_tokens is the ALERT watch list. Its scan spends one API call per
//   coin per pass and orders by staleness × volume, so every row in it competes
//   for a fixed per-minute budget. Adding 20 chains of display-only coins would
//   dilute that queue until no coin is scanned often enough to catch a cluster.
//   This table costs one call per CHAIN per refresh and is never trade-scanned,
//   so the two have completely different economics and lifecycles.
//
// It is a cache, not a ledger: rows are overwritten wholesale each sweep and
// nothing references them, so a stale or dropped row costs nothing.

export const trendingCoins = pgTable("trending_coins", {
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
    fdvUsd: doublePrecision("fdv_usd"),
    liquidityUsd: doublePrecision("liquidity_usd"),

    volume5mUsd: doublePrecision("volume_5m_usd"),
    volume1hUsd: doublePrecision("volume_1h_usd"),
    volume6hUsd: doublePrecision("volume_6h_usd"),
    volume24hUsd: doublePrecision("volume_24h_usd"),

    priceChange5m: doublePrecision("price_change_5m"),
    priceChange1h: doublePrecision("price_change_1h"),
    priceChange6h: doublePrecision("price_change_6h"),
    priceChange24h: doublePrecision("price_change_24h"),

    buys24h: integer("buys_24h"),
    sells24h: integer("sells_24h"),
    txns24h: integer("txns_24h"),

    /** Pool creation time — the "age" column. */
    poolCreatedAt: timestamp("pool_created_at", { withTimezone: true }),

    /** Position in its own chain's trending list, 1-based. Preserves GT's own
     *  ranking, which blends signals we can't recompute from these columns. */
    rank: integer("rank"),

    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_trending_network").on(table.network),
    index("idx_trending_volume").on(table.volume24hUsd.desc()),
    index("idx_trending_liquidity").on(table.liquidityUsd.desc()),
    index("idx_trending_fetched").on(table.fetchedAt),
    // The chain-filtered default ordering, which is what the page opens on.
    index("idx_trending_network_volume").on(table.network, table.volume24hUsd.desc()),
    pgPolicy("trending_coins_public_read", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS()

export type TrendingCoin = typeof trendingCoins.$inferSelect
export type NewTrendingCoin = typeof trendingCoins.$inferInsert
