import { index, pgPolicy, pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

export const stories = pgTable("stories", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    mediaUrl: text("mediaUrl").notNull(),
    mediaType: text("mediaType", { enum: ["image", "video"] }).default("image").notNull(),
    caption: text("caption"),
    views: integer("views").default(0).notNull(),
    expiresAt: timestamp("expiresAt").notNull(), // 24h from creation
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_stories_user").on(table.userId),
    index("idx_stories_expires").on(table.expiresAt),
    pgPolicy("stories_public_read", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
    pgPolicy("stories_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"userId" = (SELECT auth.uid()::text)` }),
    pgPolicy("stories_delete_own", { for: "delete", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export const storyViews = pgTable("story_views", {
    id: text("id").primaryKey(),
    storyId: text("storyId").notNull().references(() => stories.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewedAt").defaultNow().notNull(),
}, (table) => [
    index("idx_story_views_story").on(table.storyId),
    index("idx_story_views_user").on(table.userId),
    pgPolicy("story_views_select", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
    pgPolicy("story_views_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type Story = typeof stories.$inferSelect
export type NewStory = typeof stories.$inferInsert
export type StoryView = typeof storyViews.$inferSelect
