import { index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";
import { session } from "./session";
import { oauthClient } from "./oauth-client";
import { oauthRefreshToken } from "./oauth-refresh-token";

// Opaque OAuth2 access tokens (@better-auth/oauth-provider shape — the old
// oidc-provider table of the same name was renamed *_legacy at cutover).
// `token` stores base64url(sha256(<raw>)); refresh fields moved to their own
// oauthRefreshToken table, linked via refreshId. Rows are created at
// issue/refresh, deleted at revoke, read at introspection — never updated.
export const oauthAccessToken = pgTable("oauthAccessToken", {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("clientId")
        .notNull()
        .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("sessionId").references(() => session.id, { onDelete: "set null" }),
    userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    refreshId: text("refreshId").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt"),
    scopes: text("scopes").array().notNull(),
}, (table) => [
    index("idx_oauth_access_token_client").on(table.clientId),
    index("idx_oauth_access_token_session").on(table.sessionId),
    index("idx_oauth_access_token_user").on(table.userId),
    index("idx_oauth_access_token_refresh").on(table.refreshId),
    pgPolicy("oauth_access_token_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();
