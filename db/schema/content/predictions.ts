// Predictions v1 — in-house pari-mutuel markets in USDC on watchparty's own
// treasury rails. Winners split the losing pool pro-rata minus the fee (rake
// applies to the losing pool only, so a one-sided market refunds cleanly).
import { bigint, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const predictionMarkets = pgTable("prediction_markets", {
    id: uuid("id").primaryKey().defaultRandom(),
    question: text("question").notNull(),
    description: text("description"),
    category: text("category").default("general").notNull(),
    imageUrl: text("image_url"),
    creatorId: text("creator_id").notNull(),
    /** betting cutoff; after this no new bets */
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["open", "resolved", "voided"] }).default("open").notNull(),
    winningOutcome: integer("winning_outcome"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    /** rake on the LOSING pool only */
    feeBps: integer("fee_bps").default(500).notNull(),
    /** machine-checkable resolution recipe for AI-generated markets (null = manual) */
    resolutionSpec: jsonb("resolution_spec"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_prediction_markets_status").on(table.status, table.closesAt),
    pgPolicy("prediction_markets_public_read", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS()

export const predictionOutcomes = pgTable("prediction_outcomes", {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id").notNull().references(() => predictionMarkets.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    label: text("label").notNull(),
    /** denormalized pool total in USDC base units (6dp) */
    poolUsdc: bigint("pool_usdc", { mode: "bigint" }).default(sql`0`).notNull(),
}, (table) => [
    uniqueIndex("uq_prediction_outcomes").on(table.marketId, table.idx),
    index("idx_prediction_outcomes_market").on(table.marketId),
    pgPolicy("prediction_outcomes_public_read", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS()

export const predictionBets = pgTable("prediction_bets", {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id").notNull().references(() => predictionMarkets.id, { onDelete: "cascade" }),
    outcomeIdx: integer("outcome_idx").notNull(),
    userId: text("user_id").notNull(),
    amountUsdc: bigint("amount_usdc", { mode: "bigint" }).notNull(),
    /** one on-chain payment = one bet */
    txSignature: text("tx_signature").notNull().unique(),
    payoutUsdc: bigint("payout_usdc", { mode: "bigint" }),
    claimSignature: text("claim_signature"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_prediction_bets_market").on(table.marketId),
    index("idx_prediction_bets_user").on(table.userId),
    pgPolicy("prediction_bets_owner_read", { for: "select", to: "authenticated", using: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type PredictionMarket = typeof predictionMarkets.$inferSelect
export type PredictionOutcome = typeof predictionOutcomes.$inferSelect
export type PredictionBet = typeof predictionBets.$inferSelect
