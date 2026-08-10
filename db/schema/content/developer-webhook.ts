import { boolean, index, integer, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";

// Outbound developer webhooks: ONE endpoint per account (the Discord
// app-webhook model — an endpoint plus an event-type menu, not a table of
// rows). The secret signs every delivery (Stripe-style t/v1 HMAC in
// lib/developer/webhooks.ts); it's shown once at creation/reset, held here
// for signing.
export const developerWebhooks = pgTable("developer_webhooks", {
    userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    /** subscribed event types, from lib/developer/webhook-events.ts */
    events: text("events").array().default(sql`'{}'::text[]`).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    pgPolicy("developer_webhooks_own", {
        for: "all",
        to: "authenticated",
        using: sql`user_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();

// Delivery log for the console's recent-deliveries list. Metadata only — no
// payload bodies (they can carry user data). Pruned to a 30-day window on
// insert.
export const developerWebhookDeliveries = pgTable("developer_webhook_deliveries", {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    event: text("event").notNull(),
    /** HTTP status of the receiver's response; null = network error/timeout */
    status: integer("status"),
    ok: boolean("ok").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_dev_webhook_deliveries_user").on(table.userId, table.createdAt),
    pgPolicy("developer_webhook_deliveries_own_read", {
        for: "select",
        to: "authenticated",
        using: sql`user_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();
