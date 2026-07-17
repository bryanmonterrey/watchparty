import { bigint, index, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";

export const referrals = pgTable("referrals", {
    id: text("id").primaryKey(),
    referrerId: text("referrerId").notNull().references(() => user.id, { onDelete: "cascade" }),
    referredUserId: text("referredUserId").notNull().references(() => user.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "completed"] }).default("pending").notNull(),
    rewardLamports: integer("rewardLamports").default(0).notNull(),  // reward credited on completion
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_referral_referred").on(table.referredUserId), // one referrer per user
    index("idx_referral_referrer").on(table.referrerId),
    pgPolicy("referral_owner_select", { for: "select", to: "authenticated", using: sql`"referrerId" = (SELECT auth.uid()::text) OR "referredUserId" = (SELECT auth.uid()::text)` }),
    pgPolicy("referral_insert", { for: "insert", to: "authenticated", withCheck: sql`true` }),
    pgPolicy("referral_update", { for: "update", to: "authenticated", using: sql`"referredUserId" = (SELECT auth.uid()::text)` }),
]).enableRLS();

export type Referral = typeof referrals.$inferSelect;

// Accrued referral rewards: 10% of referred users' premium payments for the
// referral's first 12 months. One row per successful charge (reference =
// idempotency key); claims pay the unclaimed sum from the treasury.
export const referralEarnings = pgTable("referral_earnings", {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerId: text("referrer_id").notNull(),
    referredUserId: text("referred_user_id").notNull(),
    amountUsdc: bigint("amount_usdc", { mode: "bigint" }).notNull(),
    source: text("source").default("premium").notNull(),
    reference: text("reference").notNull().unique(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimSignature: text("claim_signature"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_referral_earnings_referrer").on(table.referrerId, table.claimedAt),
    pgPolicy("referral_earnings_owner_read", { for: "select", to: "authenticated", using: sql`referrer_id = (SELECT auth.uid()::text)` }),
]).enableRLS();

export type ReferralEarning = typeof referralEarnings.$inferSelect;
