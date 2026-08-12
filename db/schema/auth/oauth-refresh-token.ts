import { index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";
import { session } from "./session";
import { oauthClient } from "./oauth-client";

// Opaque OAuth2 refresh tokens (@better-auth/oauth-provider). `token` stores
// base64url(sha256(<raw>)) — storage is hashed, so a DB read can never
// reconstruct a live credential. Rotation is atomic upstream (CAS on
// `revoked`), and replaying a revoked token invalidates the whole family —
// the reason lib/auth/oauth-token-rotation.ts could be deleted.
export const oauthRefreshToken = pgTable("oauthRefreshToken", {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("clientId")
        .notNull()
        .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("sessionId").references(() => session.id, { onDelete: "set null" }),
    userId: text("userId")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt"),
    revoked: timestamp("revoked"),
    authTime: timestamp("authTime"),
    scopes: text("scopes").array().notNull(),
}, (table) => [
    index("idx_oauth_refresh_token_client").on(table.clientId),
    index("idx_oauth_refresh_token_session").on(table.sessionId),
    index("idx_oauth_refresh_token_user").on(table.userId),
    pgPolicy("oauth_refresh_token_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();
