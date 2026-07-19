import { doublePrecision, index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

// ─── Copy orders ──────────────────────────────────────────────────────────────
// Audit trail for the auto-copy executor (docs/exp-callouts.md §4d): one row
// per copy attempt. Drives the SQL daily-cap check (executed sum, rolling 24h,
// belt-and-braces under the on-chain recurring limit) and the 3-consecutive-
// failure autopause.

export const copyOrders = pgTable("copy_orders", {
    id: text("id").primaryKey(),
    followerId: text("followerId").notNull().references(() => user.id, { onDelete: "cascade" }),
    traderId: text("traderId").notNull().references(() => user.id, { onDelete: "cascade" }),
    leaderTradeId: text("leaderTradeId").notNull(),
    usdSize: doublePrecision("usdSize").notNull(),
    txSignature: text("txSignature"),
    status: text("status", { enum: ["executed", "failed", "skipped"] }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_copy_orders_follower_time").on(table.followerId, table.createdAt),
    index("idx_copy_orders_pair_time").on(table.followerId, table.traderId, table.createdAt),
    pgPolicy("copy_orders_select_own", { for: "select", to: "authenticated", using: sql`"followerId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type CopyOrder = typeof copyOrders.$inferSelect
