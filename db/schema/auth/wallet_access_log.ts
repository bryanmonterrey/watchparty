import { pgTable, pgPolicy, text, timestamp, boolean, json } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

export const wallet_access_log = pgTable("wallet_access_log", {
    id: text("id").primaryKey(),
    user_id: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // 'reveal_phrase' | 'export_key' | 'passkey_added' | 'passkey_removed'
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    success: boolean("success").notNull().default(true),
    error_message: text("error_message"),
    metadata: json("metadata"), // Additional context
    created_at: timestamp("created_at").defaultNow().notNull(),
}, () => [
    pgPolicy('wallet_access_log_select_own', { for: 'select', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
    // Inserts are server-side only (service role)
]).enableRLS();
