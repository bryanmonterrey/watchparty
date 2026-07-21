import { index, integer, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

// Twitch/Kick-style About-tab panels: a user-uploaded image with an optional
// link/title/body, rendered as an ordered grid. Applied via
// db/profile-socials-panels.sql (additive, RLS mirrors follows).

export const profilePanels = pgTable("profile_panels", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    imageUrl: text("imageUrl"),
    linkUrl: text("linkUrl"),
    body: text("body"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
    index("idx_profile_panels_user").on(table.userId),
    pgPolicy("profile_panels_select_public", { for: "select", to: "public", using: sql`true` }),
    pgPolicy("profile_panels_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"userId" = (SELECT auth.uid()::text)` }),
    pgPolicy("profile_panels_update_own", { for: "update", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
    pgPolicy("profile_panels_delete_own", { for: "delete", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type ProfilePanel = typeof profilePanels.$inferSelect
export type NewProfilePanel = typeof profilePanels.$inferInsert
