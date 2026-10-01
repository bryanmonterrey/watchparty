import { pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// @better-auth/oauth-provider 1.7.7's `oauthClientAssertion`: replay guard for
// private_key_jwt / client_secret_jwt assertions — the row's id is the
// assertion's jti, kept until expiresAt. Nothing of ours uses JWT client
// authentication yet; the table exists so the adapter's schema check passes.
export const oauthClientAssertion = pgTable("oauthClientAssertion", {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt").notNull(),
}, () => [
    // Server-only table — accessed via service role only
    pgPolicy("oauth_client_assertion_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();

export type OAuthClientAssertion = typeof oauthClientAssertion.$inferSelect;
