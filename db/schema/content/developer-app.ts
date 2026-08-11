import { bigint, index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";

// A developer application — the Discord "application" entity: the thing that
// owns credentials (keys, webhooks), carries an Ed25519 signing identity, and
// (later) backs a bot user. Money and entitlements stay at the ACCOUNT level;
// only credentials attach here (the invariant X's Projects layer existed to
// protect — we keep the invariant, skip the layer).
export const developerApps = pgTable("developer_apps", {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    iconUrl: text("icon_url"),
    tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),
    /** Ed25519 public key (hex) — shown to the developer, safe to leak. */
    publicKey: text("public_key").notNull(),
    /** Ed25519 private key, sealed via lib/developer/secret-box (AES-GCM). */
    privateKeyEnc: text("private_key_enc").notNull(),
    tosUrl: text("tos_url"),
    privacyUrl: text("privacy_url"),
    /** Public homepage, shown on the app directory card. */
    websiteUrl: text("website_url"),
    /** app flags bitfield (lib/developer/app-flags.ts — LISTED etc.). */
    flags: bigint("flags", { mode: "number" }).default(0).notNull(),
    /** OAuth2 client for "Sign in with watchparty" — FK-less join to oauthApplication.clientId. */
    oauthClientId: text("oauth_client_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    /** soft delete — an app id must never be reused (it may be public). */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
    index("idx_developer_apps_owner").on(table.ownerId),
    pgPolicy("developer_apps_own", {
        for: "all",
        to: "authenticated",
        using: sql`owner_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();
