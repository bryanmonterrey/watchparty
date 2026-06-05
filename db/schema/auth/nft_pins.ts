import { pgTable, pgPolicy, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

export const user_nft_pins = pgTable("user_nft_pins", {
    user_id: text("user_id")
        .primaryKey()
        .references(() => user.id, { onDelete: "cascade" }),
    pinned_nfts: text("pinned_nfts").array().default([]).notNull(),
    pinned_collections: text("pinned_collections").array().default([]).notNull(),
    hidden_collections: text("hidden_collections").array().default([]).notNull(),
    spam_nfts: text("spam_nfts").array().default([]).notNull(),
    hidden_tokens: text("hidden_tokens").array().default([]).notNull(),
    spam_transactions: text("spam_transactions").array().default([]).notNull(),
    updated_at: timestamp("updated_at").defaultNow(),
}, () => [
    pgPolicy('user_nft_pins_select_own', { for: 'select', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
    pgPolicy('user_nft_pins_insert_own', { for: 'insert', to: 'authenticated', withCheck: sql`user_id = (SELECT auth.uid()::text)` }),
    pgPolicy('user_nft_pins_update_own', { for: 'update', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
    pgPolicy('user_nft_pins_delete_own', { for: 'delete', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS();
