import { doublePrecision, index, integer, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"
import { tokens } from "./token"

// ─── Callouts ─────────────────────────────────────────────────────────────────
// pump.fun-style token callouts: one per user per 6h (enforced in the router by
// querying the latest row — no KV needed). Price/mcap are snapshotted from the
// cached market columns on tokens at call time; peakGainPct is advanced by the
// callout-performance cron and drives the 7-day caller leaderboard + XP bonuses.
// Design doc: docs/exp-callouts.md (Phase 2).

export const callouts = pgTable("callouts", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    tokenId: text("tokenId").notNull().references(() => tokens.id, { onDelete: "cascade" }),
    priceAtCall: doublePrecision("priceAtCall").notNull(),
    marketCapAtCall: doublePrecision("marketCapAtCall"),
    peakGainPct: doublePrecision("peakGainPct").default(0).notNull(), // 1.0 = +100%
    notifiedCount: integer("notifiedCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_callouts_user_time").on(table.userId, table.createdAt), // cooldown check
    index("idx_callouts_time").on(table.createdAt),                    // feed + leaderboard window
    index("idx_callouts_token").on(table.tokenId),
    pgPolicy("callouts_select_public", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
    pgPolicy("callouts_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type Callout = typeof callouts.$inferSelect
