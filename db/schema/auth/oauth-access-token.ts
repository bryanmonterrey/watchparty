import { index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";
import { oauthApplication } from "./oauth-application";

// Issued OAuth2 tokens (opaque 32-char strings, looked up by equality).
// Access 1h / refresh 7d; refresh rotation cleanup lives in
// lib/auth/oauth-token-rotation.ts. Disabling a client DELETES its rows here
// (userinfo never checks client.disabled — deletion is the revocation).
export const oauthAccessToken = pgTable("oauthAccessToken", {
    id: text("id").primaryKey(),
    accessToken: text("accessToken").notNull().unique(),
    refreshToken: text("refreshToken").notNull().unique(),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt").notNull(),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt").notNull(),
    clientId: text("clientId")
        .notNull()
        .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
}, (table) => [
    index("idx_oauth_access_token_client").on(table.clientId),
    index("idx_oauth_access_token_user").on(table.userId),
    pgPolicy("oauth_access_token_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();
