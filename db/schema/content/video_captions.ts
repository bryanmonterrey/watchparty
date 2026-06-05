import { index, unique, pgPolicy, pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { posts } from "./post"

export const videoCaptions = pgTable("video_captions", {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    postId: text("postId").notNull().references(() => posts.id, { onDelete: "cascade" }),
    language: text("language").notNull(), // e.g. 'en', 'fr'
    label: text("label").notNull(),       // e.g. 'English', 'French'
    url: text("url").notNull(),           // URL to .vtt file in Supabase Storage
    isDefault: boolean("isDefault").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_video_captions_postid").on(table.postId),
    unique("uq_video_captions_post_lang").on(table.postId, table.language),
    pgPolicy("video_captions_public_read", {
        for: "select",
        to: ["authenticated", "anon"],
        using: sql`true`,
    }),
]).enableRLS()

export type VideoCaption = typeof videoCaptions.$inferSelect
export type NewVideoCaption = typeof videoCaptions.$inferInsert
