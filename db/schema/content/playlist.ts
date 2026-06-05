import { pgTable, pgPolicy, text, timestamp, integer, boolean, primaryKey, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth"; // Adjusted import
import { posts } from "./post";
import { relations } from "drizzle-orm";

export const playlists = pgTable("playlists", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    visibility: text("visibility", { enum: ["public", "private", "unlisted"] }).notNull().default("public"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    index("idx_playlists_userid").on(table.userId),
    pgPolicy("playlists_public_read", { for: "select", to: ["authenticated", "anon"], using: sql`visibility = 'public'` }),
    pgPolicy("playlists_owner_read_all", { for: "select", to: "authenticated", using: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS();

export const playlistVideos = pgTable("playlist_videos", {
    playlistId: text("playlist_id").notNull().references(() => playlists.id, { onDelete: "cascade" }),
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
}, (t) => [
    primaryKey({ columns: [t.playlistId, t.postId] }),
    pgPolicy("playlist_videos_read", { for: "select", to: ["authenticated", "anon"], using: sql`EXISTS (SELECT 1 FROM playlists p WHERE p.id = playlist_videos.playlist_id AND (p.visibility = 'public' OR p.user_id = (SELECT auth.uid()::text)))` }),
]).enableRLS();

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
    user: one(user, {
        fields: [playlists.userId],
        references: [user.id],
    }),
    videos: many(playlistVideos),
}));

export const playlistVideosRelations = relations(playlistVideos, ({ one }) => ({
    playlist: one(playlists, {
        fields: [playlistVideos.playlistId],
        references: [playlists.id],
    }),
    post: one(posts, {
        fields: [playlistVideos.postId],
        references: [posts.id],
    }),
}));
