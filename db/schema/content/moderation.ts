import { index, pgPolicy, pgTable, text, timestamp, boolean, uniqueIndex, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"
import { posts } from "./post"

export const blocks = pgTable("blocks", {
    id: text("id").primaryKey(),
    blockerId: text("blockerId").notNull().references(() => user.id, { onDelete: "cascade" }),
    blockedId: text("blockedId").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_blocks_pair").on(table.blockerId, table.blockedId),
    index("idx_blocks_blocker").on(table.blockerId),
    index("idx_blocks_blocked").on(table.blockedId),
    pgPolicy("blocks_owner_all", { for: "all", to: "authenticated", using: sql`"blockerId" = (SELECT auth.uid()::text)` }),
    pgPolicy("blocks_select_blocked", { for: "select", to: "authenticated", using: sql`"blockedId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export const mutes = pgTable("mutes", {
    id: text("id").primaryKey(),
    muterId: text("muterId").notNull().references(() => user.id, { onDelete: "cascade" }),
    mutedId: text("mutedId").notNull().references(() => user.id, { onDelete: "cascade" }),
    muteNotifications: boolean("muteNotifications").default(true).notNull(),
    muteStories: boolean("muteStories").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_mutes_pair").on(table.muterId, table.mutedId),
    index("idx_mutes_muter").on(table.muterId),
    pgPolicy("mutes_owner_all", { for: "all", to: "authenticated", using: sql`"muterId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export const hiddenPosts = pgTable("hidden_posts", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    postId: text("postId").notNull(),
    reason: text("reason", { enum: ["not_interested", "seen_too_often", "offensive", "other"] }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_hidden_posts_pair").on(table.userId, table.postId),
    index("idx_hidden_posts_user").on(table.userId),
    pgPolicy("hidden_posts_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export const reports = pgTable("reports", {
    id: text("id").primaryKey(),
    reporterId: text("reporterId").notNull().references(() => user.id, { onDelete: "cascade" }),
    // Either a post or a user can be reported
    targetPostId: text("targetPostId").references(() => posts.id, { onDelete: "cascade" }),
    targetUserId: text("targetUserId").references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: ["spam", "harassment", "hate_speech", "misinformation", "nudity", "violence", "other"] }).notNull(),
    details: text("details"),
    status: text("status", { enum: ["pending", "reviewed", "resolved", "dismissed"] }).default("pending").notNull(),
    reviewedBy: text("reviewedBy").references(() => user.id),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_reports_reporter").on(table.reporterId),
    index("idx_reports_status").on(table.status),
    index("idx_reports_post").on(table.targetPostId),
    pgPolicy("reports_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"reporterId" = (SELECT auth.uid()::text)` }),
    pgPolicy("reports_select_own", { for: "select", to: "authenticated", using: sql`"reporterId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export const verificationRequests = pgTable("verification_requests", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }).unique(),
    requestedTier: text("requestedTier", { enum: ["verified", "business", "government"] }).notNull(),
    fullName: text("fullName").notNull(),
    bio: text("bio"),
    website: text("website"),
    twitterHandle: text("twitterHandle"),
    reason: text("reason").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
    reviewedBy: text("reviewedBy").references(() => user.id),
    reviewedAt: timestamp("reviewedAt"),
    rejectionReason: text("rejectionReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
    index("idx_verif_user").on(table.userId),
    index("idx_verif_status").on(table.status),
    pgPolicy("verif_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

// ─── Creator Bans ─────────────────────────────────────────────────────────────
// Creator-specific bans: prevent a user from interacting with a creator's content

export const creatorBans = pgTable("creator_bans", {
    id: text("id").primaryKey(),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    bannedUserId: text("bannedUserId").notNull().references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_creator_ban_pair").on(table.creatorId, table.bannedUserId),
    index("idx_creator_ban_creator").on(table.creatorId),
    pgPolicy("creator_bans_owner_all", { for: "all", to: "authenticated", using: sql`"creatorId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

// ─── Admin Actions ────────────────────────────────────────────────────────────
// Platform-level audit log for admin/mod actions (suspend, ban, remove content, etc.)

export const adminActions = pgTable("admin_actions", {
    id: text("id").primaryKey(),
    adminId: text("adminId").notNull().references(() => user.id, { onDelete: "cascade" }),
    targetUserId: text("targetUserId").references(() => user.id, { onDelete: "set null" }),
    targetPostId: text("targetPostId").references(() => posts.id, { onDelete: "set null" }),
    action: text("action", {
        enum: [
            "user_suspended",
            "user_banned",
            "user_unbanned",
            "user_verified",
            "user_unverified",
            "post_removed",
            "report_resolved",
            "report_dismissed",
            "role_changed",
        ],
    }).notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_admin_actions_admin").on(table.adminId, table.createdAt),
    index("idx_admin_actions_target_user").on(table.targetUserId, table.createdAt),
    index("idx_admin_actions_action").on(table.action, table.createdAt),
    // Only admins can insert; admins can read all; no RLS for regular users
    pgPolicy("admin_actions_insert_admin", { for: "insert", to: "authenticated", withCheck: sql`EXISTS (SELECT 1 FROM "user" WHERE id = (SELECT auth.uid()::text) AND role IN ('admin','superadmin'))` }),
    pgPolicy("admin_actions_select_admin", { for: "select", to: "authenticated", using: sql`EXISTS (SELECT 1 FROM "user" WHERE id = (SELECT auth.uid()::text) AND role IN ('admin','superadmin'))` }),
]).enableRLS()

export type Block = typeof blocks.$inferSelect
export type Mute = typeof mutes.$inferSelect
export type HiddenPost = typeof hiddenPosts.$inferSelect
export type Report = typeof reports.$inferSelect
export type VerificationRequest = typeof verificationRequests.$inferSelect
export type CreatorBan = typeof creatorBans.$inferSelect
export type AdminAction = typeof adminActions.$inferSelect
