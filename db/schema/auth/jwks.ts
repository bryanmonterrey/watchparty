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
    // 1.7.7 records the key's algorithm and curve per row (null on keys minted
    // before the bump = the plugin's configured default). db/better-auth-1.7.7-columns.sql
    alg: text("alg"),
    crv: text("crv"),
}, () => [
    pgPolicy("jwks_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
]).enableRLS();
