import { doublePrecision, index, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

// ─── Trades ───────────────────────────────────────────────────────────────────
// Server-witnessed swap ledger (docs/exp-callouts.md, Phase 4a). A `pending`
// row is inserted by wallet.getSwapTransaction (the server already knows the
// user, mints, and quoted amounts — never trust client-reported fills); the
// client best-effort reports the signature after send, and the trade-verify
// cron confirms it on-chain before flipping status. `source: "wallet"` is
// reserved for Helius-webhook trades made outside the app (Phase 4a-2).
// RLS: owner-only reads — public trader profiles are a later, opt-in feature.

export const trades = pgTable("trades", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    walletAddress: text("walletAddress").notNull(),
    txSignature: text("txSignature"), // null until the client reports it
    inputMint: text("inputMint").notNull(),
    outputMint: text("outputMint").notNull(),
    inAmountRaw: text("inAmountRaw").notNull(),  // base units as string (u64-safe)
    outAmountRaw: text("outAmountRaw").notNull(),
    usdValue: doublePrecision("usdValue"),       // quote swapUsdValue at fill (PnL basis)
    source: text("source", { enum: ["app", "wallet"] }).default("app").notNull(),
    status: text("status", { enum: ["pending", "confirmed", "failed"] }).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    confirmedAt: timestamp("confirmedAt"),
}, (table) => [
    uniqueIndex("idx_trades_signature").on(table.txSignature), // PG: multiple NULLs allowed
    index("idx_trades_user_time").on(table.userId, table.createdAt),
    index("idx_trades_status_time").on(table.status, table.createdAt), // cron scan
    pgPolicy("trades_select_own", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type Trade = typeof trades.$inferSelect
