import { boolean, index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

export const notifications = pgTable("notifications", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }), // recipient
    actorId: text("actorId").references(() => user.id, { onDelete: "cascade" }), // who triggered (null = system)
    type: text("type", {
        enum: ["follow", "like", "comment", "repost", "mention", "quote", "callout", "system"]
    }).notNull(),
    postId: text("postId"),
    commentId: text("commentId"),
    body: text("body"), // fallback text for system notifications
    isRead: boolean("isRead").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_notifications_user").on(table.userId, table.createdAt),
    index("idx_notifications_unread").on(table.userId, table.isRead),
    pgPolicy("notifications_owner", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type Notification = typeof notifications.$inferSelect
