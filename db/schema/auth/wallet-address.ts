import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./user";

// Required by better-auth's native `siwe` plugin (EVM: Ethereum, Base, Hyperliquid).
// This is NOT in the sidebar schema — sidebar was Solana-only and stored the
// connected wallet on `user.wallet_address` (a column). better-auth's SIWE plugin
// instead links external EVM addresses to a user here (multi-address, per-chain).
// Needs creating in the DB (db/migrations/0001_create_wallet_address.sql).
export const walletAddress = pgTable("walletAddress", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  chainId: integer("chainId").notNull(),
  isPrimary: boolean("isPrimary").default(false),
  createdAt: timestamp("createdAt").notNull(),
}, (t) => [index("idx_wallet_address_user").on(t.userId)]);
