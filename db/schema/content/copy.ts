import { boolean, doublePrecision, index, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

// ─── Copy-trade subscriptions ─────────────────────────────────────────────────
// A follower's standing config to copy a trader (docs/exp-callouts.md §4d).
// Gated on BOTH: the trader shares trades AND the follower holds an active
// creator subscription to the trader (copy access is the paid perk).
// Execution today is prepared-order pushes ("Copy ready — tap to execute");
// the walk-away executor lands with the on-chain Swig role delegation, and
// these caps become its SQL belt-and-braces alongside the on-chain limits.

export const copySubscriptions = pgTable("copy_subscriptions", {
    id: text("id").primaryKey(),
    followerId: text("followerId").notNull().references(() => user.id, { onDelete: "cascade" }),
    traderId: text("traderId").notNull().references(() => user.id, { onDelete: "cascade" }),
    maxUsdcPerCopy: doublePrecision("maxUsdcPerCopy").notNull(),
    dailyUsdcCap: doublePrecision("dailyUsdcCap").notNull(),
    paused: boolean("paused").default(false).notNull(),
    autoCopyRoleId: integer("autoCopyRoleId"), // on-chain executor role id; null = prepared-order pushes only
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
    uniqueIndex("idx_copy_subs_pair").on(table.followerId, table.traderId),
    index("idx_copy_subs_trader").on(table.traderId),
    pgPolicy("copy_subs_follower_all", { for: "all", to: "authenticated", using: sql`"followerId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type CopySubscription = typeof copySubscriptions.$inferSelect
