import { boolean, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

export const notificationPrefs = pgTable("notification_prefs", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }).unique(),
    likes: boolean("likes").default(true).notNull(),
    comments: boolean("comments").default(true).notNull(),
    reposts: boolean("reposts").default(true).notNull(),
    follows: boolean("follows").default(true).notNull(),
    tips: boolean("tips").default(true).notNull(),
    mentions: boolean("mentions").default(true).notNull(),
    quotes: boolean("quotes").default(true).notNull(),
    system: boolean("system").default(true).notNull(),
    pushEnabled: boolean("pushEnabled").default(false).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, () => [
    pgPolicy("notif_prefs_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export const webPushSubscriptions = pgTable("web_push_subscriptions", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_push_subs_endpoint").on(table.endpoint),
    pgPolicy("push_subs_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type NotificationPrefs = typeof notificationPrefs.$inferSelect
export type WebPushSubscription = typeof webPushSubscriptions.$inferSelect
