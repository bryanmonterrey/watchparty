import { boolean, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"
import { posts } from "./post"

export type PollOption = { id: string; text: string; votesCount: number; imageUrl?: string }

export const polls = pgTable("polls", {
    id: text("id").primaryKey(),
    postId: text("postId").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    options: jsonb("options").$type<PollOption[]>().notNull(),
    allowMultiple: boolean("allowMultiple").default(false).notNull(),
    endsAt: timestamp("endsAt"),
    totalVotes: integer("totalVotes").default(0).notNull(),
    isEnded: boolean("isEnded").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_polls_post").on(table.postId),
    index("idx_polls_user").on(table.userId),
    pgPolicy("polls_public_read", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
    pgPolicy("polls_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"userId" = (SELECT auth.uid()::text)` }),
    pgPolicy("polls_update_own", { for: "update", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export const pollVotes = pgTable("poll_votes", {
    id: text("id").primaryKey(),
    pollId: text("pollId").notNull().references(() => polls.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    optionIds: jsonb("optionIds").$type<string[]>().notNull(),
    votedAt: timestamp("votedAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_poll_votes_poll_user").on(table.pollId, table.userId),
    index("idx_poll_votes_poll").on(table.pollId),
    pgPolicy("poll_votes_select", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
    pgPolicy("poll_votes_own", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type Poll = typeof polls.$inferSelect
export type PollVote = typeof pollVotes.$inferSelect
