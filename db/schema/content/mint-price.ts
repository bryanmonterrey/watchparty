import { doublePrecision, integer, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// ─── Mint prices ──────────────────────────────────────────────────────────────
// Price + decimals cache for mints seen in confirmed trades (plus SOL/wSOL).
// Refreshed inside /api/cron/pnl-snapshots before each recompute: prices from
// Jupiter's lite price API with `tokens.priceUsd` as the launchpad fallback,
// decimals from Helius DAS (fetched once — immutable). Powers unrealized PnL
// and the USD estimate on webhook-ingested external trades.

export const mintPrices = pgTable("mint_prices", {
    mint: text("mint").primaryKey(),
    decimals: integer("decimals"),
    priceUsd: doublePrecision("priceUsd"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, () => [
    pgPolicy("mint_prices_select_public", { for: "select", to: ["authenticated", "anon"], using: sql`true` }),
]).enableRLS()

export type MintPrice = typeof mintPrices.$inferSelect
