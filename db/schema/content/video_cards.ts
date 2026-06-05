import { index, pgPolicy, pgTable, text, integer, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { posts } from "./post"

export const videoCards = pgTable("video_cards", {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    postId: text("postId").notNull().references(() => posts.id, { onDelete: "cascade" }),
    type: text("type").notNull(),         // "video" | "playlist" | "channel" | "link" | "poll"
    title: text("title"),
    message: text("message"),
    url: text("url"),
    startTime: integer("startTime").notNull().default(0),  // seconds
    duration: integer("duration").notNull().default(5),    // seconds card is visible
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
    index("idx_video_cards_postid").on(table.postId),
    pgPolicy("video_cards_public_read", {
        for: "select",
        to: ["authenticated", "anon"],
        using: sql`true`,
    }),
]).enableRLS()

export type VideoCard = typeof videoCards.$inferSelect
export type NewVideoCard = typeof videoCards.$inferInsert
