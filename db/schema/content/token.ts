import { bigint, index, pgPolicy, pgTable, primaryKey, text, timestamp, integer, boolean, jsonb, doublePrecision } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

export const tokens = pgTable("tokens", {
    id: text("id").primaryKey(), // The initial nanoid when draft, or token address
    tokenAddress: text("tokenAddress"), // The actual Solana Mint Address when live
    poolAddress: text("poolAddress"), // Meteora Pool Address
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("imageUrl"),
    twitterUrl: text("twitterUrl"),
    telegramUrl: text("telegramUrl"),
    websiteUrl: text("websiteUrl"),
    creatorFeePercent: integer("creatorFeePercent").default(0),
    status: text("status", { enum: ["draft", "live"] }).default("draft").notNull(),
    earningsEnabled: boolean("earningsEnabled").default(true),
    splits: jsonb("splits"),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    // A coin ABOUT a person rather than a piece of content: no post backs it,
    // and its content page is the creator's profile. One per creator, enforced
    // by a partial unique index (db/creator-coin-column.sql).
    //
    // It also differs in WHO MAY LAUNCH it: a post's or stream's coin can be
    // launched by anyone, because the first buy IS the launch. A creator coin
    // can only be launched by its creator — see trade.launchCreatorCoin.
    isCreatorCoin: boolean("is_creator_coin").notNull().default(false),

    // ─── Cached market data — written by the token-stream worker, read by the
    // trade feed. Keeps the read path RPC-free so it scales to many users. ───
    phase: text("phase", { enum: ["new", "migrating", "migrated"] }).default("new").notNull(),
    priceUsd: doublePrecision("priceUsd"),
    marketCapUsd: doublePrecision("marketCapUsd"),
    volume24hUsd: doublePrecision("volume24hUsd"),
    priceChange24h: doublePrecision("priceChange24h"),
    // Short-window deltas (Surge tab + timeframe pills)
    priceChange5m: doublePrecision("priceChange5m"),
    priceChange1h: doublePrecision("priceChange1h"),
    priceChange6h: doublePrecision("priceChange6h"),
    volume5mUsd: doublePrecision("volume5mUsd"),
    volume1hUsd: doublePrecision("volume1hUsd"),
    bondingProgress: doublePrecision("bondingProgress").default(0), // 0–100
    txCount24h: integer("txCount24h").default(0),
    holderCount: integer("holderCount").default(0),
    lastSyncedAt: timestamp("lastSyncedAt"),
    // Price-alert baseline (web push): price at the last alert; a push fires
    // on a ≥20% move from here, at most once per hour per token.
    lastAlertPriceUsd: doublePrecision("lastAlertPriceUsd"),
    lastAlertAt: timestamp("lastAlertAt"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
    index("idx_tokens_creatorid").on(table.creatorId),
    index("idx_tokens_live_feed").on(table.status, table.phase),
    pgPolicy("tokens_public_read", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS()

export type Token = typeof tokens.$inferSelect
export type NewToken = typeof tokens.$inferInsert

import { relations } from "drizzle-orm"

export const tokensRelations = relations(tokens, ({ one }) => ({
    creator: one(user, {
        fields: [tokens.creatorId],
        references: [user.id],
    }),
}))

// ─── Coin notification subscriptions (web push price/migration alerts) ───
export const tokenAlertSubscriptions = pgTable("token_alert_subscriptions", {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    tokenId: text("token_id").notNull().references(() => tokens.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    primaryKey({ columns: [table.userId, table.tokenId] }),
    index("idx_token_alert_subs_token").on(table.tokenId),
    pgPolicy("token_alert_subs_owner_all", { for: "all", to: "authenticated", using: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type TokenAlertSubscription = typeof tokenAlertSubscriptions.$inferSelect

// ─── Drift perps accounts opened through watchparty ───
// Server-side only (no client RLS policies). sweptTakerFees anchors the
// perps referral sweep: fees since last sweep = on-chain cumulative − swept.
export const driftAccounts = pgTable("drift_accounts", {
    userId: text("user_id").primaryKey(),
    authority: text("authority").notNull(),
    sweptTakerFees: bigint("swept_taker_fees", { mode: "bigint" }).default(sql`0`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS()

export type DriftAccount = typeof driftAccounts.$inferSelect
