import { index, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

export const follows = pgTable("follows", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    followerId: text("followerId").notNull().references(() => user.id, { onDelete: "cascade" }),
    followingId: text("followingId").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_follows_pair").on(table.followerId, table.followingId),
    index("idx_follows_follower").on(table.followerId),
    index("idx_follows_following").on(table.followingId),
    pgPolicy("follows_select_public", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
    pgPolicy("follows_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"followerId" = (SELECT auth.uid()::text)` }),
    pgPolicy("follows_delete_own", { for: "delete", to: "authenticated", using: sql`"followerId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type Follow = typeof follows.$inferSelect
export type NewFollow = typeof follows.$inferInsert
