import { boolean, integer, jsonb, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// @better-auth/oauth-provider 1.7.7's `oauthResource` model: a protected
// resource (RFC 8707 resource indicator) tokens can be minted for. Property
// keys mirror the plugin's field names verbatim (the drizzle adapter resolves
// fields by TS property key). Added 2026-10-01 with the 1.7.7 bump; the
// adapter logged "Missing tables" until it existed. Unused by us yet.
export const oauthResource = pgTable("oauthResource", {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull().unique(),
    name: text("name").notNull(),
    accessTokenTtl: integer("accessTokenTtl"),
    refreshTokenTtl: integer("refreshTokenTtl"),
    signingAlgorithm: text("signingAlgorithm"),
    signingKeyId: text("signingKeyId"),
    allowedScopes: text("allowedScopes").array(),
    customClaims: jsonb("customClaims"),
    dpopBoundAccessTokensRequired: boolean("dpopBoundAccessTokensRequired").default(false),
    disabled: boolean("disabled").default(false),
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt"),
    policyVersion: integer("policyVersion").default(1),
    metadata: jsonb("metadata"),
}, () => [
    // Server-only table — accessed via service role only
    pgPolicy("oauth_resource_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();

export type OAuthResource = typeof oauthResource.$inferSelect;
