import { index, pgPolicy, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

// Multichain account addresses, all derived from the account's single BIP39
// phrase (see lib/chains/derive.ts).
//
// Keyed by chain KIND, not chain id: the five EVM networks (Ethereum, Base,
// Polygon, HyperEVM, Robinhood) share one secp256k1 address, so storing a row
// per chain would duplicate the same string five times and invite drift.
// Resolve kind → chains through lib/chains/registry.
//
// Distinct from `walletAddress` (better-auth's SIWE table for EXTERNAL wallets a
// user links). This table is the user's own derived addresses.
export const walletAddresses = pgTable("wallet_addresses", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** ChainKind: "solana" | "evm" | "bitcoin" | "sui" */
  chain_kind: text("chain_kind").notNull(),
  address: text("address").notNull(),
  /** BIP-44/SLIP-0010 path this address came from — needed to re-derive for signing. */
  derivation_path: text("derivation_path").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  unique("wallet_addresses_user_kind_unique").on(t.user_id, t.chain_kind),
  index("idx_wallet_addresses_user").on(t.user_id),
  index("idx_wallet_addresses_address").on(t.address),
  pgPolicy('wallet_addresses_select_own', { for: 'select', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
  pgPolicy('wallet_addresses_insert_own', { for: 'insert', to: 'authenticated', withCheck: sql`user_id = (SELECT auth.uid()::text)` }),
  pgPolicy('wallet_addresses_update_own', { for: 'update', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
  pgPolicy('wallet_addresses_delete_own', { for: 'delete', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS();
