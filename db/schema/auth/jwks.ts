import { pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Signing keys for the better-auth jwt plugin (EdDSA id_tokens served at
// /api/auth/jwks). privateKey is AES-GCM-encrypted under the better-auth
// secret by the plugin itself before storage.
export const jwks = pgTable("jwks", {
    id: text("id").primaryKey(),
    publicKey: text("publicKey").notNull(),
    privateKey: text("privateKey").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    expiresAt: timestamp("expiresAt"),
}, () => [
    pgPolicy("jwks_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();
