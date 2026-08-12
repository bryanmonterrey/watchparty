import { boolean, index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

// LEGACY (since the @better-auth/oauth-provider migration): the deprecated
// oidc-provider plugin's client registry, superseded by oauth-client.ts
// (`oauthClient`). The table is kept for audit and rollback; live rows were
// copied across (secrets unsealed → rehashed) by
// scripts/db/migrate-oauth-clients.mjs. Nothing at runtime should read this —
// it exists so the migration script and a rollback can.
export const oauthApplication = pgTable("oauthApplication", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon"),
    /** JSON string or null — the plugin JSON.parses this UNGUARDED. */
    metadata: text("metadata"),
    clientId: text("clientId").notNull().unique(),
    /** Sealed via lib/developer/secret-box (AES-GCM) — never plaintext. */
    clientSecret: text("clientSecret"),
    /** Comma-joined exact-match redirect URIs — commas are rejected at write time. */
    redirectUrls: text("redirectUrls").notNull(),
    /** web | native | user-agent-based | public */
    type: text("type").notNull(),
    disabled: boolean("disabled").default(false).notNull(),
    userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
}, (table) => [
    index("idx_oauth_application_user").on(table.userId),
    // Server-only table — accessed via service role only
    pgPolicy("oauth_application_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();
