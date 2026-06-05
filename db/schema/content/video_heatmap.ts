import { pgTable, pgPolicy, text, integer, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { posts } from "./post";

export const videoHeatmap = pgTable("video_heatmap", {
    postId: text("postId").notNull().references(() => posts.id, { onDelete: "cascade" }),
    bucket: integer("bucket").notNull(), // floor(seconds / 5) — one bucket per 5s segment
    hits: integer("hits").default(1).notNull(),
}, (table) => [
    primaryKey({ columns: [table.postId, table.bucket] }),
    index("idx_video_heatmap_post").on(table.postId),
    pgPolicy("video_heatmap_public_read", {
        for: "select",
        to: ["authenticated", "anon"],
        using: sql`true`,
    }),
    pgPolicy("video_heatmap_public_insert", {
        for: "insert",
        to: ["authenticated", "anon"],
        withCheck: sql`true`,
    }),
    pgPolicy("video_heatmap_public_update", {
        for: "update",
        to: ["authenticated", "anon"],
        using: sql`true`,
        withCheck: sql`true`,
    }),
]).enableRLS();

export type VideoHeatmap = typeof videoHeatmap.$inferSelect;
