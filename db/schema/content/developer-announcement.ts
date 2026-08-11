import { index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Developer-platform announcements — the feed behind the console's
// Notifications page (X's §2). Platform news that affects integrations:
// deprecations, incidents, new events. Authored by admins; read by everyone.
export const developerAnnouncements = pgTable("developer_announcements", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // info | warning | incident — drives the badge colour.
    level: text("level").default("info").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_developer_announcements_created").on(table.createdAt),
    // Public read — announcements are platform-wide news, not per-user.
    pgPolicy("developer_announcements_public_read", {
        for: "select",
        to: ["authenticated", "anon"],
        using: sql`true`,
    }),
]).enableRLS();
