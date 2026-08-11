import { boolean, index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";
import { oauthApplication } from "./oauth-application";

// A user's consent grant for a client. Deliberately NO unique(clientId,userId):
// the plugin's consent endpoint does an unconditional insert, so re-consenting
// with widened scopes creates a new row (stale rows are tolerated by design —
// findOne may occasionally re-prompt).
export const oauthConsent = pgTable("oauthConsent", {
    id: text("id").primaryKey(),
    clientId: text("clientId")
        .notNull()
        .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    userId: text("userId")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    consentGiven: boolean("consentGiven").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
}, (table) => [
    index("idx_oauth_consent_client").on(table.clientId),
    index("idx_oauth_consent_user").on(table.userId),
    pgPolicy("oauth_consent_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();
