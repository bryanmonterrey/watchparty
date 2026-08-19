import { boolean, index, pgPolicy, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

/** Max Solana wallets a single account may link, the Swig wallet included. */
export const MAX_LINKED_WALLETS = 15;

export type LinkedWalletSource = "swig" | "extension";

/** Chain kind of a single-chain linked wallet; null on the multichain swig row. */
export type LinkedWalletChainKind = "solana" | "evm" | "bitcoin" | "sui";

// Up to 15 linked wallets per account, exactly one of them primary.
//
// The Swig (embedded) wallet is the default primary; wallets the user signs in
// with via an extension are linked alongside it, and the primary can be
// switched freely.
//
// A WALLET IS NOT AN ADDRESS. The generated wallet is ONE wallet holding an
// address on every chain kind (see `wallet_addresses`); an external wallet is
// one wallet on one chain. So signing in with Base, then generating, then
// linking MetaMask is three wallets — and any of them can be the one in use.
//
// `user.wallet_address` mirrors the primary row's SOLANA address, which is why
// it is null for an account whose only wallet is external EVM: that wallet
// genuinely has no Solana address. Its ~135 readers are Solana-specific
// surfaces and correctly render their create-wallet CTA in that case, rather
// than being handed a 0x string they would feed to PublicKey.
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
  /**
   * Which chain kind this wallet's `address` is on — "solana", "evm", …
   *
   * NULL means MULTICHAIN, which is only ever the generated ("swig") wallet:
   * one wallet whose per-kind addresses live in `wallet_addresses`, all derived
   * from the one phrase. An external wallet is a single chain, so it names it.
   *
   * Nullable rather than defaulted to "solana" because the distinction is real:
   * "this wallet has a Solana address" and "this wallet is a Solana wallet" are
   * different claims, and only the second one should stop an EVM wallet from
   * becoming the wallet in use.
   */
  chain_kind: text("chain_kind").$type<LinkedWalletChainKind>(),
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
