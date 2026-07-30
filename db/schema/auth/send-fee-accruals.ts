import { index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

// Platform fees owed on EVM sends, waiting to be swept.
//
// Every other chain takes the 0.5% fee inside the user's own transaction:
// Solana adds an instruction, Bitcoin adds an output. EVM can't — a native
// transfer or an ERC-20 `transfer()` pays exactly one address, so taking a fee
// in the same transaction would mean routing sends through a fee-splitter
// contract deployed on five chains.
//
// Instead the send stays a single plain transfer at normal gas, the fee is
// recorded here, and app/api/cron/send-fee-sweep collects it later — one
// transaction per (wallet, chain, token) per run rather than one per send. Same
// shape as the premium collector.
//
// Amounts are in the SENT asset's base units, as a string: an 18-decimal token
// exceeds what a JS number can hold, and numeric drift on a ledger of money
// owed is not recoverable.
export const sendFeeAccruals = pgTable("send_fee_accruals", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** ChainId, not kind — the fee is owed on the network the send happened on. */
  chain: text("chain").notNull(),
  /** Token contract, or null for the chain's native coin. */
  contract: text("contract"),
  /** Base units of the sent asset. String, never a number — see above. */
  amount: text("amount").notNull(),
  /** The send this fee came from, so a disputed charge is traceable. */
  source_tx: text("source_tx"),
  /** "pending" | "swept" | "failed" */
  status: text("status").notNull().default("pending"),
  /** Sweep transaction that collected this row. */
  swept_tx: text("swept_tx"),
  /** Why the last sweep attempt failed — usually an empty gas balance. */
  last_error: text("last_error"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  swept_at: timestamp("swept_at"),
}, (t) => [
  // The sweep's only query: pending rows, grouped by who owes them.
  index("idx_send_fee_accruals_pending").on(t.status, t.user_id),
  index("idx_send_fee_accruals_user").on(t.user_id),
  // Read-only to the owner: rows are written by the server on send, and
  // settled by the sweep. A user editing what they owe would defeat the point.
  pgPolicy("send_fee_accruals_select_own", {
    for: "select",
    to: "authenticated",
    using: sql`user_id = (SELECT auth.uid()::text)`,
  }),
]).enableRLS();
