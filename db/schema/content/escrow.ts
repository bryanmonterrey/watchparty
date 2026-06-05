import { pgTable, pgPolicy, text, timestamp, real } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const escrows = pgTable("escrows", {
    id: text("id").primaryKey(), // nanoid
    tokenId: text("tokenId").notNull(), // The address of the Token or Pool
    platform: text("platform").notNull(), // e.g., "twitter", "twitch"
    username: text("username").notNull(), // The social handle, e.g., "ninja"
    sharePercentage: real("sharePercentage").notNull(), // Percentage of the vault
    claimerPrivateKey: text("claimerPrivateKey").notNull(), // bs58 encoded secret key of proxy
    status: text("status", { enum: ["pending", "claimed"] }).default("pending").notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, () => [
    // Server-only table — contains private keys, accessed via service role only
    pgPolicy('escrows_deny_direct_access', { for: 'all', to: ['authenticated', 'anon'], using: sql`false` }),
]).enableRLS()

export type Escrow = typeof escrows.$inferSelect
export type NewEscrow = typeof escrows.$inferInsert
