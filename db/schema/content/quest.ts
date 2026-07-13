import { index, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

// ─── Quest progress ───────────────────────────────────────────────────────────
// One row per user × quest × period window. Quest definitions live in code
// (lib/quests.ts); periodKey ("2026-07-13" / "2026-W28") makes daily/weekly
// resets free — a new window is a fresh row, no cron reset job. Completion pays
// XP via server/lib/quests.ts (idempotent through the xp_events dedupe index).

export const questProgress = pgTable("quest_progress", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    questId: text("questId").notNull(),
    periodKey: text("periodKey").notNull(),
    progress: integer("progress").default(0).notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_quest_progress_key").on(table.userId, table.questId, table.periodKey),
    index("idx_quest_progress_user").on(table.userId),
    pgPolicy("quest_progress_select_own", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type QuestProgress = typeof questProgress.$inferSelect
