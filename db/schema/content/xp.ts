import { index, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

// ─── XP Events ────────────────────────────────────────────────────────────────
// Append-only XP ledger. One row per award; the unique (userId, kind, refId)
// index makes awards idempotent (retries/double-fires can't double-award).
// user.xp / user.level are denormalized rollups updated by server/lib/xp.ts.
// Kinds/amounts/caps are defined in lib/xp.ts — kind stays plain text here so
// adding a kind never needs a migration.

export const xpEvents = pgTable("xp_events", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    refId: text("refId").notNull(), // the entity that earned it (postId, followerId, tokenId…)
    amount: integer("amount").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_xp_events_dedupe").on(table.userId, table.kind, table.refId),
    index("idx_xp_events_user_time").on(table.userId, table.createdAt),
    pgPolicy("xp_events_select_own", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type XpEvent = typeof xpEvents.$inferSelect
