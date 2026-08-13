import { index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";

// A developer Project — an organizational bucket that groups apps (and through
// them their keys/webhooks). Mirrors db/developer-projects.sql. Org-only: the
// `plan` column is an inert stub so the console can show X's plan chip and real
// paid tiers can activate later without a schema change. A project grants and
// gates NOTHING — money/entitlements stay at the account level.
export const developerProjects = pgTable("developer_projects", {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    /** Inert plan stub — 'pay_per_use' today; real tiers layer on later. */
    plan: text("plan").default("pay_per_use").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_developer_projects_owner").on(table.ownerId),
    pgPolicy("developer_projects_own", {
        for: "all",
        to: "authenticated",
        using: sql`owner_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();
