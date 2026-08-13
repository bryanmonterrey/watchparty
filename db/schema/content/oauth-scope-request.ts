import { index, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";
import { developerApps } from "./developer-app";

// A developer app's request for a PRIVILEGED OAuth scope, pending human review.
// Mirrors db/oauth-scope-requests.sql. The set of privileged scopes lives in
// lib/developer/oauth-scopes.ts (PRIVILEGED_SCOPES) and is EMPTY today, so this
// queue is inert until the first privileged scope + endpoint is defined.
// Fail-closed: an approved request adds the scope to the app's oauthClient
// allow-list; the OAuth provider rejects any scope not on that list.
export const oauthScopeRequests = pgTable("oauth_scope_requests", {
    id: text("id").primaryKey(),
    appId: text("app_id").references(() => developerApps.id, { onDelete: "cascade" }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    scope: text("scope").notNull(),
    /** pending | approved | rejected */
    status: text("status").default("pending").notNull(),
    reason: text("reason"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_oauth_scope_requests_app").on(table.appId),
    index("idx_oauth_scope_requests_status").on(table.status),
    uniqueIndex("uq_oauth_scope_requests_live")
        .on(table.appId, table.scope)
        .where(sql`status in ('pending', 'approved')`),
    pgPolicy("oauth_scope_requests_own", {
        for: "all",
        to: "authenticated",
        using: sql`user_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();
