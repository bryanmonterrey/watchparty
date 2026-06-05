import { boolean, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";

// ─── Subscription Tiers (creator-defined) ────────────────────────────────────

export const subscriptionTiers = pgTable("subscription_tiers", {
    id: text("id").primaryKey(),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),                      // e.g. "Fan", "Super Fan"
    description: text("description"),
    priceMonthly: integer("priceMonthly").notNull(),   // in lamports
    priceAnnual: integer("priceAnnual"),               // annual discount price, in lamports
    perks: jsonb("perks").$type<string[]>().default([]),
    isActive: boolean("isActive").default(true).notNull(),
    sortOrder: integer("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
    index("idx_sub_tiers_creator").on(table.creatorId),
    pgPolicy("sub_tiers_creator_all", { for: "all", to: "authenticated", using: sql`"creatorId" = (SELECT auth.uid()::text)` }),
    pgPolicy("sub_tiers_public_select", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS();

// ─── Subscriptions ────────────────────────────────────────────────────────────

export const subscriptions = pgTable("subscriptions", {
    id: text("id").primaryKey(),
    subscriberId: text("subscriberId").notNull().references(() => user.id, { onDelete: "cascade" }),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    tierId: text("tierId").notNull().references(() => subscriptionTiers.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["active", "cancelled", "expired"] }).default("active").notNull(),
    billingCycle: text("billingCycle", { enum: ["monthly", "annual"] }).default("monthly").notNull(),
    currentPeriodStart: timestamp("currentPeriodStart").notNull(),
    currentPeriodEnd: timestamp("currentPeriodEnd").notNull(),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
    cancelledAt: timestamp("cancelledAt"),
    txSignature: text("txSignature"),                 // Solana tx proof
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_sub_unique").on(table.subscriberId, table.creatorId),
    index("idx_sub_subscriber").on(table.subscriberId),
    index("idx_sub_creator").on(table.creatorId),
    pgPolicy("sub_owner_select", { for: "select", to: "authenticated", using: sql`"subscriberId" = (SELECT auth.uid()::text) OR "creatorId" = (SELECT auth.uid()::text)` }),
    pgPolicy("sub_owner_insert", { for: "insert", to: "authenticated", withCheck: sql`"subscriberId" = (SELECT auth.uid()::text)` }),
    pgPolicy("sub_owner_update", { for: "update", to: "authenticated", using: sql`"subscriberId" = (SELECT auth.uid()::text) OR "creatorId" = (SELECT auth.uid()::text)` }),
]).enableRLS();

// ─── Gift Subscriptions ───────────────────────────────────────────────────────

export const giftSubscriptions = pgTable("gift_subscriptions", {
    id: text("id").primaryKey(),
    senderId: text("senderId").notNull().references(() => user.id, { onDelete: "cascade" }),
    recipientId: text("recipientId").notNull().references(() => user.id, { onDelete: "cascade" }),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    tierId: text("tierId").notNull().references(() => subscriptionTiers.id, { onDelete: "cascade" }),
    durationMonths: integer("durationMonths").default(1).notNull(),
    message: text("message"),
    status: text("status", { enum: ["pending", "redeemed", "expired"] }).default("pending").notNull(),
    txSignature: text("txSignature"),
    redeemedAt: timestamp("redeemedAt"),
    expiresAt: timestamp("expiresAt").notNull(),      // gift expires if not redeemed
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_gift_sender").on(table.senderId),
    index("idx_gift_recipient").on(table.recipientId),
    pgPolicy("gift_sub_owner_select", { for: "select", to: "authenticated", using: sql`"senderId" = (SELECT auth.uid()::text) OR "recipientId" = (SELECT auth.uid()::text)` }),
    pgPolicy("gift_sub_insert", { for: "insert", to: "authenticated", withCheck: sql`"senderId" = (SELECT auth.uid()::text)` }),
    pgPolicy("gift_sub_update", { for: "update", to: "authenticated", using: sql`"recipientId" = (SELECT auth.uid()::text)` }),
]).enableRLS();

// ─── Creator Earnings (ledger) ────────────────────────────────────────────────

export const creatorEarnings = pgTable("creator_earnings", {
    id: text("id").primaryKey(),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["subscription", "gift", "tip", "dm_unlock"] }).notNull(),
    amountLamports: integer("amountLamports").notNull(),
    referenceId: text("referenceId"),                 // subscriptionId, tipId, etc.
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_earnings_creator").on(table.creatorId),
    pgPolicy("earnings_owner_select", { for: "select", to: "authenticated", using: sql`"creatorId" = (SELECT auth.uid()::text)` }),
    pgPolicy("earnings_insert_auth", { for: "insert", to: "authenticated", withCheck: sql`true` }),
]).enableRLS();

// ─── Payouts ──────────────────────────────────────────────────────────────────

export const payouts = pgTable("payouts", {
    id: text("id").primaryKey(),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    amountLamports: integer("amountLamports").notNull(),
    status: text("status", { enum: ["pending", "processing", "completed", "failed"] }).default("pending").notNull(),
    txSignature: text("txSignature"),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
}, (table) => [
    index("idx_payouts_creator").on(table.creatorId),
    pgPolicy("payouts_owner_all", { for: "all", to: "authenticated", using: sql`"creatorId" = (SELECT auth.uid()::text)` }),
]).enableRLS();

// ─── DM Unlocks ───────────────────────────────────────────────────────────────

export const dmUnlocks = pgTable("dm_unlocks", {
    id: text("id").primaryKey(),
    payerId: text("payerId").notNull().references(() => user.id, { onDelete: "cascade" }),
    creatorId: text("creatorId").notNull().references(() => user.id, { onDelete: "cascade" }),
    amountLamports: integer("amountLamports").notNull(),
    txSignature: text("txSignature"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_dm_unlock_pair").on(table.payerId, table.creatorId),
    index("idx_dm_unlock_payer").on(table.payerId),
    pgPolicy("dm_unlock_owner_select", { for: "select", to: "authenticated", using: sql`"payerId" = (SELECT auth.uid()::text) OR "creatorId" = (SELECT auth.uid()::text)` }),
    pgPolicy("dm_unlock_insert", { for: "insert", to: "authenticated", withCheck: sql`"payerId" = (SELECT auth.uid()::text)` }),
]).enableRLS();

export type SubscriptionTier = typeof subscriptionTiers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type GiftSubscription = typeof giftSubscriptions.$inferSelect;
export type CreatorEarning = typeof creatorEarnings.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
