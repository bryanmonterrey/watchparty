import { boolean, index, jsonb, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

// OAuth2/OIDC client registry for "Sign in with watchparty" — the
// @better-auth/oauth-provider plugin's `oauthClient` model (replaced the
// deprecated oidc-provider's `oauthApplication`, kept as *_legacy for audit).
// One row per third-party client; joined to developer_apps via
// developer_apps.oauth_client_id. Property keys mirror the plugin's field
// names verbatim (the drizzle adapter resolves fields by TS property key).
//
// Load-bearing field semantics (verified in 1.6.27 dist):
// - `public: true` is what lets a secret-less client through the token
//   endpoint (`!client.public && !clientSecret` → invalid_client).
// - `type` must be "native"/"user-agent-based" for public clients, "web"
//   for confidential ones.
// - `clientSecret` stores base64url(sha256(secret)), unpadded — the plugin's
//   defaultHasher under storeClientSecret: "hashed". Never plaintext.
// - `requirePKCE` null counts as TRUE (isPKCERequired: `requirePKCE ?? true`)
//   — PKCE is structural in this plugin; only an explicit false opts out.
// - `scopes` null inherits the server catalog (OAUTH_SCOPE_IDS) and adapts
//   when the catalog grows; set it only to RESTRICT a client.
export const oauthClient = pgTable("oauthClient", {
    id: text("id").primaryKey(),
    clientId: text("clientId").notNull().unique(),
    clientSecret: text("clientSecret"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skipConsent"),
    enableEndSession: boolean("enableEndSession"),
    subjectType: text("subjectType"),
    scopes: text("scopes").array(),
    userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt"),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("softwareId"),
    softwareVersion: text("softwareVersion"),
    softwareStatement: text("softwareStatement"),
    redirectUris: text("redirectUris").array().notNull(),
    postLogoutRedirectUris: text("postLogoutRedirectUris").array(),
    tokenEndpointAuthMethod: text("tokenEndpointAuthMethod"),
    grantTypes: text("grantTypes").array(),
    responseTypes: text("responseTypes").array(),
    public: boolean("public"),
    type: text("type"),
    requirePKCE: boolean("requirePKCE"),
    referenceId: text("referenceId"),
    metadata: jsonb("metadata"),
}, (table) => [
    index("idx_oauth_client_user").on(table.userId),
    // Server-only table — accessed via service role only
    pgPolicy("oauth_client_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();
