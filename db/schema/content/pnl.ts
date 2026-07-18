import { doublePrecision, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

// ─── PnL snapshots ────────────────────────────────────────────────────────────
// Materialized per-user trading PnL over rolling windows, recomputed by
// /api/cron/pnl-snapshots from confirmed `trades` (docs/exp-callouts.md §4b).
// v1 is REALIZED PnL only (cash-sided swaps; window-scoped cost basis) — no
// decimals/price oracle needed. Unrealized comes later with a price layer.
// Leaderboard reads filter to users with shareTrades; RLS keeps rows owner-only
// for the anon/authenticated roles (server connection bypasses RLS).

export const pnlSnapshots = pgTable("pnl_snapshots", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    window: text("window", { enum: ["24h", "7d", "30d"] }).notNull(),
    realizedUsd: doublePrecision("realizedUsd").default(0).notNull(),
    unrealizedUsd: doublePrecision("unrealizedUsd").default(0).notNull(), // open positions marked via mint_prices
    volumeUsd: doublePrecision("volumeUsd").default(0).notNull(),
    tradeCount: integer("tradeCount").default(0).notNull(),
    winRate: doublePrecision("winRate"), // closed positions won / closed positions, null = nothing closed
    computedAt: timestamp("computedAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_pnl_snapshots_key").on(table.userId, table.window),
    pgPolicy("pnl_snapshots_select_own", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type PnlSnapshot = typeof pnlSnapshots.$inferSelect
