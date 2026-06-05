import { boolean, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

// ─── VIP Members ─────────────────────────────────────────────────────────────

export const vipMembers = pgTable("vip_members", {
    id: text("id").primaryKey(),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    memberId: text("memberId").notNull().references(() => user.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_vip_members_pair").on(table.creatorId, table.memberId),
    index("idx_vip_members_creator").on(table.creatorId),
    pgPolicy("vip_members_creator_all", { for: "all", to: "authenticated", using: sql`"creatorId" = (SELECT auth.uid()::text)` }),
    pgPolicy("vip_members_select_member", { for: "select", to: "authenticated", using: sql`"memberId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

// ─── Creator Moderators ───────────────────────────────────────────────────────

export const creatorModerators = pgTable("creator_moderators", {
    id: text("id").primaryKey(),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    moderatorId: text("moderatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_creator_mods_pair").on(table.creatorId, table.moderatorId),
    index("idx_creator_mods_creator").on(table.creatorId),
    pgPolicy("creator_mods_creator_all", { for: "all", to: "authenticated", using: sql`"creatorId" = (SELECT auth.uid()::text)` }),
    pgPolicy("creator_mods_select_mod", { for: "select", to: "authenticated", using: sql`"moderatorId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

// ─── Welcome Message Config ───────────────────────────────────────────────────

export const welcomeMessageConfig = pgTable("welcome_message_config", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }).unique(),
    enabled: boolean("enabled").default(false).notNull(),
    message: text("message").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
    pgPolicy("welcome_msg_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

// ─── Mass Messages ────────────────────────────────────────────────────────────

export const massMessages = pgTable("mass_messages", {
    id: text("id").primaryKey(),
    senderId: text("senderId").notNull().references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    mediaUrl: text("mediaUrl"),
    audience: text("audience", { enum: ["all_followers", "vips"] }).default("all_followers").notNull(),
    recipientCount: integer("recipientCount").default(0).notNull(),
    status: text("status", { enum: ["draft", "sending", "sent", "failed"] }).default("draft").notNull(),
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_mass_messages_sender").on(table.senderId),
    pgPolicy("mass_messages_owner_all", { for: "all", to: "authenticated", using: sql`"senderId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

// ─── Media Vault ──────────────────────────────────────────────────────────────

export const mediaFolders = pgTable("media_folders", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_media_folders_user").on(table.userId),
    pgPolicy("media_folders_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export const mediaVault = pgTable("media_vault", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    folderId: text("folderId").references(() => mediaFolders.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnailUrl"),
    type: text("type", { enum: ["image", "video", "audio"] }).notNull(),
    name: text("name"),
    size: integer("size"), // bytes
    mimeType: text("mimeType"),
    isFavorite: boolean("isFavorite").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_media_vault_user").on(table.userId),
    index("idx_media_vault_folder").on(table.folderId),
    pgPolicy("media_vault_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

// ─── Custom Emotes ────────────────────────────────────────────────────────────

export const customEmotes = pgTable("custom_emotes", {
    id: text("id").primaryKey(),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. ":gigachad:"
    imageUrl: text("imageUrl").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_custom_emotes_creator").on(table.creatorId),
    pgPolicy("custom_emotes_owner_all", { for: "all", to: "authenticated", using: sql`"creatorId" = (SELECT auth.uid()::text)` }),
    pgPolicy("custom_emotes_select_public", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS()

// ─── Promo Codes ──────────────────────────────────────────────────────────────

export const promoCodes = pgTable("promo_codes", {
    id: text("id").primaryKey(),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    discountPercent: integer("discountPercent").notNull().default(0),
    maxUses: integer("maxUses"),
    usedCount: integer("usedCount").default(0).notNull(),
    expiresAt: timestamp("expiresAt"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_promo_code_unique").on(table.creatorId, table.code),
    index("idx_promo_creator").on(table.creatorId),
    pgPolicy("promo_owner_all", { for: "all", to: "authenticated", using: sql`"creatorId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

// ─── Subscriber Badges ────────────────────────────────────────────────────────

export const subscriberBadges = pgTable("subscriber_badges", {
    id: text("id").primaryKey(),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    subscriberId: text("subscriberId").notNull().references(() => user.id, { onDelete: "cascade" }),
    followMonths: integer("followMonths").default(0).notNull(),
    tier: text("tier", { enum: ["bronze", "silver", "gold", "platinum", "diamond"] }).notNull().default("bronze"),
    awardedAt: timestamp("awardedAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_badge_creator_sub").on(table.creatorId, table.subscriberId),
    index("idx_badge_creator").on(table.creatorId),
    index("idx_badge_subscriber").on(table.subscriberId),
    pgPolicy("badges_creator_all", { for: "all", to: "authenticated", using: sql`"creatorId" = (SELECT auth.uid()::text)` }),
    pgPolicy("badges_subscriber_select", { for: "select", to: "authenticated", using: sql`"subscriberId" = (SELECT auth.uid()::text)` }),
    pgPolicy("badges_public_select", { for: "select", to: "anon", using: sql`true` }),
]).enableRLS()

// ─── Advertiser Profile ───────────────────────────────────────────────────────

export const advertiserProfile = pgTable("advertiser_profile", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    advertiserId: integer("advertiserId"),
    company: text("company"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
    index("idx_advertiser_profile_user").on(table.userId),
    pgPolicy("advertiser_profile_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type VIPMember = typeof vipMembers.$inferSelect
export type CreatorModerator = typeof creatorModerators.$inferSelect
export type WelcomeMessageConfig = typeof welcomeMessageConfig.$inferSelect
export type MassMessage = typeof massMessages.$inferSelect
export type MediaFolder = typeof mediaFolders.$inferSelect
export type MediaVaultItem = typeof mediaVault.$inferSelect
export type CustomEmote = typeof customEmotes.$inferSelect
export type PromoCode = typeof promoCodes.$inferSelect
export type SubscriberBadge = typeof subscriberBadges.$inferSelect
export type AdvertiserProfile = typeof advertiserProfile.$inferSelect
