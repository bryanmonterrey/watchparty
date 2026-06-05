import { index, pgPolicy, pgTable, text, timestamp, integer, boolean, jsonb, real } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"
import { tokens } from "./token"

export const posts = pgTable("posts", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    replyToId: text("replyToId"),
    repostOfId: text("repostOfId"), // null = original, non-null = repost/quote
    isHighlight: boolean("isHighlight").default(false).notNull(),
    isArticle: boolean("isArticle").default(false).notNull(),
    title: text("title"),
    content: text("content"),
    imageUrl: text("imageUrl"),
    media: jsonb("media").$type<{ type: "image" | "video"; url: string }[]>().default([]),

    videoUrl: text("videoUrl"),
    thumbnailUrl: text("thumbnailUrl"),
    duration: integer("duration").default(0),
    playbackId: text("playbackId"),
    isLive: boolean("isLive").default(false).notNull(),
    isShort: boolean("isShort").default(false).notNull(),
    category: text("category"),
    language: jsonb("language").$type<string[]>().default([]),
    recordingDate: timestamp("recordingDate"),
    videoLocation: text("videoLocation"),
    collaborators: jsonb("collaborators").$type<{ id: string; name: string; username?: string; avatar_url?: string }[]>(),
    visibility: text("visibility", { enum: ["public", "private", "unlisted"] }).default("public").notNull(),
    replyPrivacy: text("replyPrivacy", { enum: ["everyone", "followers", "verified", "token_holders"] }).default("everyone").notNull(),
    audience: text("audience", { enum: ["everyone", "followers", "verified", "token_holders", "community", "vip"] }).default("everyone").notNull(),
    communityId: text("communityId"), // For future integration
    status: text("status", { enum: ["draft", "scheduled", "published", "archived", "deleted"] }).default("published").notNull(),
    likes: integer("likes").default(0).notNull(),
    reposts: integer("reposts").default(0).notNull(),
    comments: integer("comments").default(0).notNull(),
    views: integer("views").default(0).notNull(),
    baseScore: real("baseScore").default(0).notNull(),

    // Content warning
    hasContentWarning: boolean("hasContentWarning").default(false).notNull(),
    contentWarningText: text("contentWarningText"),

    // Token Launch Fields
    tokenId: text("tokenId").references(() => tokens.id),
    ticker: text("ticker"),
    token_image: text("token_image"),
    tokenStatus: text("tokenStatus", { enum: ["draft", "live"] }),

    // Pay-Per-View
    isPaywalled: boolean("isPaywalled").default(false).notNull(),
    paywallPrice: integer("paywallPrice"), // in lamports

    // Link Preview
    linkPreview: jsonb("linkPreview").$type<{
        url: string;
        title: string | null;
        description: string | null;
        imageUrl: string | null;
        siteName: string | null;
    } | null>(),

    // Pin to profile (only one allowed per user)
    isPinned: boolean("isPinned").default(false).notNull(),

    // Scheduling
    scheduledFor: timestamp("scheduledFor"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
    index("idx_posts_userid").on(table.userId),
    index("idx_posts_visibility_status").on(table.visibility, table.status),
    index("idx_posts_base_score").on(table.baseScore),
    pgPolicy("posts_public_read", { for: "select", to: ["authenticated", "anon"], using: sql`visibility = 'public' AND status = 'published'` }),
    pgPolicy("posts_owner_read_all", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
