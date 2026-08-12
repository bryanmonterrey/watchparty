import { index, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";
import { oauthClient } from "./oauth-client";

// A user's consent grant for a client (@better-auth/oauth-provider shape).
// Row EXISTENCE is the consent — the old `consentGiven` boolean is gone, and
// the plugin now UPSERTS (findOne → update scopes) instead of appending, so
// unlike the legacy table this one holds exactly one row per (client, user).
// The partial unique index makes that invariant real (we never set
// referenceId; rows with one are org/team-scoped consents, distinct by
// design).
export const oauthConsent = pgTable("oauthConsent", {
    id: text("id").primaryKey(),
    clientId: text("clientId")
        .notNull()
        .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt"),
}, (table) => [
    index("idx_oauth_consent_client").on(table.clientId),
    index("idx_oauth_consent_user").on(table.userId),
    uniqueIndex("uq_oauth_consent_client_user")
        .on(table.clientId, table.userId)
        .where(sql`"referenceId" is null`),
    pgPolicy("oauth_consent_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();
