import { doublePrecision, index, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

// ─── Weekly leaderboard finishes ──────────────────────────────────────────────
// Permanent record of where users finished on the weekly boards. The live
// leaderboards (callout.leaderboard, pnl.leaderboard) are rolling 7d windows —
// once a week rolls over, "finished #1 Top Caller, week 29" is unrecoverable.
// Snapshotted Monday ~00:00 UTC by /api/cron/weekly-finishes (rider on the
// */10 cron slot) BEFORE the badge UI exists, so week-1 finishes are never
// lost. Feeds the top-caller / top-trader finish badges.
// Design doc: docs/design-brief-2026-07.md §1.

export const weeklyFinishes = pgTable("weekly_finishes", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    board: text("board", { enum: ["caller", "trader"] }).notNull(),
    isoWeek: text("isoWeek").notNull(), // e.g. "2026-W29" — the Mon–Sun week that just ended
    rank: integer("rank").notNull(),    // 1-based position at snapshot time
    score: doublePrecision("score").default(0).notNull(), // board metric: capped-gain sum (caller) / realizedUsd (trader)
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_weekly_finishes_key").on(table.board, table.isoWeek, table.userId),
    index("idx_weekly_finishes_user").on(table.userId), // badge computation
    pgPolicy("weekly_finishes_select_public", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS()

export type WeeklyFinish = typeof weeklyFinishes.$inferSelect
