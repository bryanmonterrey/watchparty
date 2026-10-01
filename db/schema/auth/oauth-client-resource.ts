import { index, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { oauthClient } from "./oauth-client";
import { oauthResource } from "./oauth-resource";

// @better-auth/oauth-provider 1.7.7's `oauthClientResource` join: which
// clients may request which resources. Authoritative only with
// `enforcePerClientResources: true` on the plugin (we do not set it), so
// every enabled resource stays reachable by every client. One row per
// (clientId, resourceId) — the plugin relies on that uniqueness.
export const oauthClientResource = pgTable("oauthClientResource", {
    id: text("id").primaryKey(),
    clientId: text("clientId").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resourceId").notNull().references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt"),
}, (table) => [
    index("idx_oauth_client_resource_client").on(table.clientId),
    index("idx_oauth_client_resource_resource").on(table.resourceId),
    uniqueIndex("uq_oauth_client_resource_pair").on(table.clientId, table.resourceId),
    // Server-only table — accessed via service role only
    pgPolicy("oauth_client_resource_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();

export type OAuthClientResource = typeof oauthClientResource.$inferSelect;
