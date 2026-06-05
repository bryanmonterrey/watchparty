import { boolean, integer, pgTable, pgPolicy, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

export const encrypted_wallets = pgTable("encrypted_wallets", {
    id: text("id").primaryKey(),
    user_id: text("user_id")
        .notNull()
        .unique()
        .references(() => user.id, { onDelete: "cascade" }),
    address: text("address").notNull().unique(),
    encrypted_privkey: text("encrypted_privkey").notNull(),
    encrypted_mnemonic: text("encrypted_mnemonic"), // Encrypted 12-word recovery phrase
    iv: text("iv").notNull(),
    mnemonic_iv: text("mnemonic_iv"), // Separate IV for mnemonic encryption
    salt: text("salt").notNull(),
    passkey_credential_id: text("passkey_credential_id").notNull(),
    pinned_nfts: text("pinned_nfts").array().default([]).notNull(),
    pinned_collections: text("pinned_collections").array().default([]).notNull(),
    key_version: integer("key_version").default(1).notNull(),
    // Phase 3: key split — d1 is the XOR complement stored server-side,
    // d2 lives in the user's browser (IndexedDB). d2_backup lets users
    // recover d2 on a new device using their passkey PRF output.
    encrypted_d1: text("encrypted_d1"),
    encrypted_d1_iv: text("encrypted_d1_iv"),
    encrypted_d2_backup: text("encrypted_d2_backup"),
    d2_backup_iv: text("d2_backup_iv"),
    // Swig smart wallet (account abstraction layer)
    swig_id: text("swig_id"),
    swig_address: text("swig_address"),
    swig_account_created: boolean("swig_account_created").default(false).notNull(),
    // FROST 2-of-2 threshold signing — server share + public info
    frost_server_share: text("frost_server_share"),               // AES-GCM encrypted server signing share
    frost_server_share_iv: text("frost_server_share_iv"),         // IV for above
    frost_client_share_encrypted: text("frost_client_share_encrypted"), // AES-GCM encrypted client share (recovery backup)
    frost_client_share_iv: text("frost_client_share_iv"),         // IV for above
    frost_public_key: text("frost_public_key"),                   // base64 group pubkey = Swig root authority
    frost_public_info: text("frost_public_info"),                 // JSON-encoded FrostPublicInfo
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
}, () => [
    pgPolicy('encrypted_wallets_select_own', { for: 'select', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
    pgPolicy('encrypted_wallets_insert_own', { for: 'insert', to: 'authenticated', withCheck: sql`user_id = (SELECT auth.uid()::text)` }),
    pgPolicy('encrypted_wallets_update_own', { for: 'update', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
    pgPolicy('encrypted_wallets_delete_own', { for: 'delete', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS();