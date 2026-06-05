import { index, pgPolicy, pgTable, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"
import { posts } from "./post"

export const postUnlocks = pgTable("post_unlocks", {
    id: text("id").primaryKey(),
    postId: text("postId").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    pricePaid: integer("pricePaid").notNull(), // lamports paid at time of unlock
    txSignature: text("txSignature").notNull(), // Solana tx proof
    unlockedAt: timestamp("unlockedAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_post_unlocks_post_user").on(table.postId, table.userId),
    index("idx_post_unlocks_user").on(table.userId),
    index("idx_post_unlocks_post").on(table.postId),
    pgPolicy("post_unlocks_select_own", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
    pgPolicy("post_unlocks_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type PostUnlock = typeof postUnlocks.$inferSelect
export type NewPostUnlock = typeof postUnlocks.$inferInsert
