import { index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";

// Filtered-stream rules per developer app (X's Streaming Rules model). Rules
// are stored + managed here; the real-time matching/delivery engine is a
// later phase — until then a rule is durable config, exactly like X shows an
// empty-then-populated rules table.
export const developerStreamRules = pgTable("developer_stream_rules", {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    appId: text("app_id").notNull(),
    value: text("value").notNull(),
    tag: text("tag"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_developer_stream_rules_app").on(table.appId),
    pgPolicy("developer_stream_rules_own", {
        for: "all",
        to: "authenticated",
        using: sql`user_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();
