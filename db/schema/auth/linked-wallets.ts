import { boolean, index, pgPolicy, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

/** Max Solana wallets a single account may link, the Swig wallet included. */
export const MAX_LINKED_WALLETS = 15;

export type LinkedWalletSource = "swig" | "extension";

// Up to 15 linked Solana wallets per account, exactly one of them primary.
//
// The Swig (embedded) wallet is the default primary; wallets the user signs in
// with via an extension are linked alongside it, and the primary can be
// switched freely. `user.wallet_address` mirrors whichever row is primary, so
// the ~135 existing readers of that column keep working untouched.
//
// Distinct from `wallet_addresses` (the user's own derived per-chain addresses)
// and from `walletAddress` (better-auth's SIWE table for external EVM wallets).
export const linkedWallets = pgTable("linked_wallets", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  /** "swig" = the embedded wallet we derive; "extension" = a wallet they hold. */
  source: text("source").$type<LinkedWalletSource>().notNull(),
  label: text("label"),
  is_primary: boolean("is_primary").default(false).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  // A wallet belongs to exactly one account — sign-in already relies on this.
  unique("linked_wallets_address_unique").on(t.address),
  index("idx_linked_wallets_user").on(t.user_id),
  pgPolicy('linked_wallets_select_own', { for: 'select', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
  pgPolicy('linked_wallets_insert_own', { for: 'insert', to: 'authenticated', withCheck: sql`user_id = (SELECT auth.uid()::text)` }),
  pgPolicy('linked_wallets_update_own', { for: 'update', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
  pgPolicy('linked_wallets_delete_own', { for: 'delete', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS();

// NOTE: one-primary-per-user is enforced by a partial unique index created in
// db/linked-wallets.sql (drizzle can't express `WHERE is_primary`). Two
// primaries would make user.wallet_address ambiguous, so it belongs in the
// database rather than in application discipline.
