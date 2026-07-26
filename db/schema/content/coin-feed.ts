import { boolean, doublePrecision, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// ─── Coin alert feed (fomo-style) ─────────────────────────────────────────────
// Two additive tables behind the /home left rail:
//
//   tracked_tokens   — every coin we watch, ACROSS CHAINS. Deliberately separate
//                      from `tokens` (which is watchparty-launched coins only,
//                      creatorId → user). A watchparty launch is mirrored in here
//                      too, via wpTokenId, so the scanner has ONE loop and the
//                      feed can deep-link to our own coin page when we own it.
//   coin_feed_events — the rail's item stream. One append-only table so the rail
//                      paginates on a single (occurredAt, id) cursor instead of
//                      unioning callouts/predictions/clusters at read time.
//
// Chain identity is the GeckoTerminal network slug ("solana", "base", "eth", …)
// — that's the market-data source already wired for `tokens` (lib/tokens/
// market-sync.ts), and it covers ~200 networks, so widening coverage is a config
// row in lib/coin-feed/networks.ts rather than new plumbing.

export const trackedTokens = pgTable("tracked_tokens", {
    /** `${network}:${tokenAddress}` — stable across chains, no id collisions. */
    id: text("id").primaryKey(),
    network: text("network").notNull(),
    tokenAddress: text("token_address").notNull(),
    /** Deepest pool; the trade scan and price both read from it. */
    poolAddress: text("pool_address").notNull(),
    dexId: text("dex_id"),

    symbol: text("symbol").notNull(),
    name: text("name"),
    imageUrl: text("image_url"),

    /** Set when this coin was launched on watchparty (tokens.id). No FK: the
     *  scanner writes this table from a background pass and must never fail on
     *  a token row being deleted mid-pass. */
    wpTokenId: text("wp_token_id"),

    // Cached market columns — same role as the ones on `tokens`, so a rail row
    // renders "$612K MC" without touching an API on the read path.
    priceUsd: doublePrecision("price_usd"),
    marketCapUsd: doublePrecision("market_cap_usd"),
    liquidityUsd: doublePrecision("liquidity_usd"),
    volume24hUsd: doublePrecision("volume_24h_usd"),
    priceChange5m: doublePrecision("price_change_5m"),
    priceChange1h: doublePrecision("price_change_1h"),
    priceChange24h: doublePrecision("price_change_24h"),

    /** Manually pinned coins survive the staleness sweep. */
    pinned: boolean("pinned").default(false).notNull(),

    /** Watermark for the cluster scan: newest trade timestamp already folded in.
     *  Trades at or before it are skipped, so a re-scan can't re-emit. */
    lastTradeAt: timestamp("last_trade_at", { withTimezone: true }),
    /** Round-robin cursor — the scan takes the least-recently-scanned coins. */
    lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
    uniqueIndex("uq_tracked_tokens_pool").on(table.network, table.poolAddress),
    index("idx_tracked_tokens_scan").on(table.lastScanAt),
    index("idx_tracked_tokens_network").on(table.network),
    index("idx_tracked_tokens_wp").on(table.wpTokenId),
    pgPolicy("tracked_tokens_public_read", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS()

export type TrackedToken = typeof trackedTokens.$inferSelect
export type NewTrackedToken = typeof trackedTokens.$inferInsert

/** The item kinds the rail renders. Adding one = a case in alert-row.tsx. */
export const COIN_FEED_KINDS = [
    "cluster_buy",   // N distinct wallets bought the same coin inside a window
    "cluster_sell",
    "whale_buy",     // one wallet, size above the whale threshold
    "whale_sell",
    "launch",        // a watchparty coin went live
    "migration",     // bonding curve completed
    "callout",       // someone called the coin (callouts table)
    "prediction",    // a prediction market opened/resolved
] as const

export type CoinFeedKind = (typeof COIN_FEED_KINDS)[number]

/** Trader identities snapshotted onto a cluster event — the row's avatar stack.
 *  Wallet addresses are stored for dedupe/attribution only and are NEVER
 *  rendered (see the no-wallet-address-display rule); the UI shows the derived
 *  avatar, or the watchparty profile when the wallet maps to one of our users. */
export type CoinFeedTrader = {
    address: string
    userId?: string
    username?: string | null
    avatarUrl?: string | null
}

export const coinFeedEvents = pgTable("coin_feed_events", {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: COIN_FEED_KINDS }).notNull(),
    network: text("network").notNull(),

    // Coin identity, denormalized so the rail renders with no joins.
    trackedTokenId: text("tracked_token_id"),
    wpTokenId: text("wp_token_id"),
    tokenAddress: text("token_address"),
    symbol: text("symbol").notNull(),
    tokenImageUrl: text("token_image_url"),

    side: text("side", { enum: ["buy", "sell"] }),
    traderCount: integer("trader_count"),
    usdValue: doublePrecision("usd_value"),
    /** Market cap at the moment of the event — the "at $612K MC" half of a row. */
    marketCapUsd: doublePrecision("market_cap_usd"),
    traders: jsonb("traders").$type<CoinFeedTrader[]>(),

    // Native-event linkage (callouts, predictions).
    actorId: text("actor_id"),
    refId: text("ref_id"),
    title: text("title"),

    /** Idempotency key. A re-scan of an overlapping trade window recomputes the
     *  same cluster; the unique index turns the second write into a no-op
     *  instead of a duplicate row in the rail. */
    dedupeKey: text("dedupe_key").notNull(),

    /** When it happened on-chain — the rail sorts on this, NOT createdAt, so a
     *  late scan can't jump a stale cluster above fresher ones. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex("uq_coin_feed_dedupe").on(table.dedupeKey),
    // The rail's only ORDER BY. id breaks ties so the keyset cursor is total.
    index("idx_coin_feed_cursor").on(table.occurredAt.desc(), table.id.desc()),
    index("idx_coin_feed_kind").on(table.kind, table.occurredAt.desc()),
    index("idx_coin_feed_network").on(table.network, table.occurredAt.desc()),
    index("idx_coin_feed_token").on(table.trackedTokenId, table.occurredAt.desc()),
    pgPolicy("coin_feed_events_public_read", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS()

export type CoinFeedEvent = typeof coinFeedEvents.$inferSelect
export type NewCoinFeedEvent = typeof coinFeedEvents.$inferInsert
