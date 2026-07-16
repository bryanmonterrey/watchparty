import { index, pgPolicy, pgTable, text, timestamp, integer, boolean, jsonb, doublePrecision } from "drizzle-orm/pg-core"
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
