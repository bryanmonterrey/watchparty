import { index, integer, pgPolicy, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"
import { posts } from "./post"

export const likes = pgTable("likes", {
    id: text("id").primaryKey(),
    contentId: text("contentId").notNull(),
    contentType: text("contentType", { enum: ["post"] }).default("post").notNull(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_likes_user_content").on(table.userId, table.contentId, table.contentType),
    index("idx_likes_content").on(table.contentId, table.contentType),
    pgPolicy("likes_select", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
    pgPolicy("likes_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"userId" = (SELECT auth.uid()::text)` }),
    pgPolicy("likes_delete_own", { for: "delete", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export const bookmarks = pgTable("bookmarks", {
    id: text("id").primaryKey(),
    contentId: text("contentId").notNull(),
    contentType: text("contentType", { enum: ["post"] }).notNull().default("post"),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_bookmarks_user_content").on(table.userId, table.contentId, table.contentType),
    index("idx_bookmarks_user").on(table.userId),
    pgPolicy("bookmarks_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export const seenPosts = pgTable("seen_posts", {
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    postId: text("postId").notNull(),
    seenAt: timestamp("seenAt").defaultNow().notNull(),
}, (table) => [
    primaryKey({ columns: [table.userId, table.postId] }),
    index("idx_seen_posts_user").on(table.userId),
    pgPolicy("seen_posts_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

// ─── Post Boosts ──────────────────────────────────────────────────────────────
// SOL-funded post promotion; boostScore decays toward expiresAt

export const postBoosts = pgTable("post_boosts", {
    id: text("id").primaryKey(),
    postId: text("postId").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    amountLamports: integer("amountLamports").notNull(),
    txSignature: text("txSignature").notNull(),
    boostScore: real("boostScore").default(0).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_post_boosts_post").on(table.postId),
    index("idx_post_boosts_user").on(table.userId),
    index("idx_post_boosts_expires").on(table.expiresAt),
    pgPolicy("post_boosts_select", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
    pgPolicy("post_boosts_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type Like = typeof likes.$inferSelect
export type Bookmark = typeof bookmarks.$inferSelect
export type PostBoost = typeof postBoosts.$inferSelect
