import { bigint, boolean, index, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";

// ─── Platform Premium ─────────────────────────────────────────────────────────
// The site's own paid tiers (distinct from creator subscriptions in
// ./subscription.ts). Billed in USDC, auto-recurring via the Solana
// Subscriptions & Allowances program (see lib/chains/solana/subscriptions/).
// Tier matrix + pricing live in lib/premium/tiers.ts.

// ─── Merchant-published on-chain plans (one per self-serve tier × cycle) ───────
// Populated once by scripts/premium/create-plans.ts; read by premium.getPlans.

export const premiumPlans = pgTable("premium_plans", {
    id: text("id").primaryKey(),
    tierKey: text("tierKey").notNull(),                                  // basic | premium | biz_basic | biz_pro
    billingCycle: text("billingCycle", { enum: ["monthly", "annual"] }).notNull(),
    priceUsdcBaseUnits: bigint("priceUsdcBaseUnits", { mode: "number" }).notNull(), // USDC, 6 dp
    planId: integer("planId").notNull(),                                // stable on-chain plan id
    planPda: text("planPda").notNull(),                                 // derived Plan PDA
    collector: text("collector").notNull(),                             // merchant/treasury pubkey
    mint: text("mint").notNull(),                                       // USDC mint
    periodHours: integer("periodHours").notNull(),
    createdAtChain: bigint("createdAtChain", { mode: "number" }),       // on-chain plan createdAt (unix s)
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
    uniqueIndex("idx_premium_plan_tier_cycle").on(table.tierKey, table.billingCycle),
    pgPolicy("premium_plans_public_select", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS();

// ─── User premium subscriptions (one active row per user) ──────────────────────

export const premiumSubscriptions = pgTable("premium_subscriptions", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    tierKey: text("tierKey").notNull(),
    billingCycle: text("billingCycle", { enum: ["monthly", "annual"] }).notNull(),
    status: text("status", { enum: ["active", "past_due", "cancelled", "expired"] }).default("active").notNull(),
    currentPeriodStart: timestamp("currentPeriodStart").notNull(),
    currentPeriodEnd: timestamp("currentPeriodEnd").notNull(),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
    cancelledAt: timestamp("cancelledAt"),
    // On-chain references
    subscriberWallet: text("subscriberWallet").notNull(),   // delegator wallet (pull source owner)
    planPda: text("planPda").notNull(),
    subscriptionPda: text("subscriptionPda").notNull(),
    subscriptionAuthorityPda: text("subscriptionAuthorityPda").notNull(),
    delegatorAta: text("delegatorAta").notNull(),
    subscribeTxSignature: text("subscribeTxSignature"),
    lastChargeSig: text("lastChargeSig"),
    lastChargeAt: timestamp("lastChargeAt"),
    failedAttempts: integer("failedAttempts").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
    uniqueIndex("idx_premium_sub_user").on(table.userId),
    index("idx_premium_sub_due").on(table.status, table.currentPeriodEnd),
    pgPolicy("premium_sub_owner_select", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
    pgPolicy("premium_sub_owner_insert", { for: "insert", to: "authenticated", withCheck: sql`"userId" = (SELECT auth.uid()::text)` }),
    pgPolicy("premium_sub_owner_update", { for: "update", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS();

// ─── Enterprise / Custom contact-sales leads ───────────────────────────────────

export const premiumLeads = pgTable("premium_leads", {
    id: text("id").primaryKey(),
    userId: text("userId").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    orgName: text("orgName"),
    message: text("message"),
    status: text("status", { enum: ["new", "contacted", "closed"] }).default("new").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    index("idx_premium_leads_status").on(table.status),
    pgPolicy("premium_leads_owner_insert", { for: "insert", to: "authenticated", withCheck: sql`true` }),
    pgPolicy("premium_leads_owner_select", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS();

export type PremiumPlan = typeof premiumPlans.$inferSelect;
export type PremiumSubscription = typeof premiumSubscriptions.$inferSelect;
export type PremiumLead = typeof premiumLeads.$inferSelect;
