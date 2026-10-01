import { pgTable, text, doublePrecision, bigint, index, primaryKey, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * OHLCV we own, so a chart read never leaves our database.
 *
 * Why this exists: GeckoTerminal rate-limits by IP, and the Cloudflare Worker's
 * egress is a shared address — production charts went blank while the identical
 * call succeeded from a laptop. Renting data on the READ path means the chart
 * fails exactly when traffic arrives. See docs/live-charts-plan.md.
 *
 * Keyed to the POOL, not the token: a token can trade in several pools and the
 * candle series belongs to the market, not the asset. The token→pool mapping
 * already lives in trending_coins / tracked_tokens / coin_index.
 *
 * THREE resolutions are stored — "1", "60", "1D" — not the seven TradingView
 * asks for. 5m/15m/4h/12h are exact aggregates of a stored tier, so storing
 * them multiplies write cost for nothing; the read path rolls them up.
 *
 * Retention is not optional: 1m candles are ~1,440 rows per pool per day, so a
 * couple of hundred pools is ~288k rows/day. The sync prunes 1m past a week and
 * 1h past a quarter; 1D is cheap enough to keep.
 */
export const coinCandles = pgTable(
    "coin_candles",
    {
        network: text("network").notNull(),
        poolAddress: text("pool_address").notNull(),
        /** TradingView resolution string — only "1", "60" and "1D" are stored. */
        resolution: text("resolution").notNull(),
        /** Bar OPEN time, unix seconds. bigint because it outlives 2038. */
        ts: bigint("ts", { mode: "number" }).notNull(),

        o: doublePrecision("o").notNull(),
        h: doublePrecision("h").notNull(),
        l: doublePrecision("l").notNull(),
        c: doublePrecision("c").notNull(),
        v: doublePrecision("v"),
    },
    (t) => [
        // The natural key. Also what makes the sync idempotent — re-fetching an
        // overlapping window upserts rather than duplicating.
        primaryKey({ columns: [t.network, t.poolAddress, t.resolution, t.ts] }),
        // Every read is "this series, newest N bars in a window", which is
        // exactly this index's shape.
        index("coin_candles_series_idx").on(t.network, t.poolAddress, t.resolution, t.ts),
        // Server-only: read through postgres (bypasses RLS); the API roles get
        // nothing (db/enable-rls-coin-tables.sql, 2026-10-01).
        pgPolicy("coin_candles_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
    ],
).enableRLS();
