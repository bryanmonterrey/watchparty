import { index, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
