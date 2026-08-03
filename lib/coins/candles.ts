import "server-only";

import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { coinCandles } from "@/db/schema/content/coin-candles";

/** The only resolutions written to `coin_candles`. Everything TradingView asks
 *  for is either one of these or an exact multiple of one. */
export const STORED_RESOLUTIONS = ["1", "60", "1D"] as const;
export type StoredResolution = (typeof STORED_RESOLUTIONS)[number];

/** Bar length in seconds, per TradingView resolution string. */
const BAR_SECONDS: Record<string, number> = {
    "1": 60,
    "5": 300,
    "15": 900,
    "60": 3600,
    "240": 14400,
    "720": 43200,
    "1D": 86400,
    D: 86400,
};

export const barSeconds = (resolution: string) => BAR_SECONDS[resolution] ?? 3600;

/**
 * Which stored tier a requested resolution rolls up FROM.
 *
 * 5m and 15m are whole multiples of 1m; 4h and 12h are whole multiples of 1h.
 * Aggregating is exact, so storing those four separately would multiply write
 * cost for a series we can already derive.
 */
export function sourceResolution(resolution: string): StoredResolution {
    switch (resolution) {
        case "1":
        case "5":
        case "15":
            return "1";
        case "1D":
        case "D":
            return "1D";
        default:
            return "60";
    }
}

export type Candle = { ts: number; o: number; h: number; l: number; c: number; v: number | null };

/**
 * Read a series from OUR database, rolling up to the requested resolution.
 *
 * The whole point of the table: a chart read never leaves Postgres, so it can't
 * be broken by an upstream that rate-limits our egress. GeckoTerminal stays as
 * the BACKFILL source only — see lib/coins/candle-sync.
 *
 * The roll-up is done in SQL rather than in JS because the alternative is
 * pulling every 1-minute bar in the window across the wire to fold four of them
 * together. Bucketing on `floor(ts / span)` is exact for every resolution we
 * serve, since each is a whole multiple of its source tier.
 */
export async function readCandles(
    network: string,
    poolAddress: string,
    resolution: string,
    from: number,
    to: number,
    limit = 1000,
): Promise<Candle[]> {
    const source = sourceResolution(resolution);
    const span = barSeconds(resolution);
    const sourceSpan = barSeconds(source);

    const where = and(
        eq(coinCandles.network, network),
        eq(coinCandles.poolAddress, poolAddress),
        eq(coinCandles.resolution, source),
        gte(coinCandles.ts, from),
        lte(coinCandles.ts, to),
    );

    // Exact tier — no folding needed.
    if (span === sourceSpan) {
        const rows = await db
            .select({ ts: coinCandles.ts, o: coinCandles.o, h: coinCandles.h, l: coinCandles.l, c: coinCandles.c, v: coinCandles.v })
            .from(coinCandles)
            .where(where)
            .orderBy(asc(coinCandles.ts))
            .limit(limit);
        return rows;
    }

    // Roll up. open/close are the FIRST/LAST bar of each bucket by time, which
    // is what makes this a candle rather than a summary — hence the ordered
    // aggregates rather than min/max on o and c.
    const bucket = sql<number>`(${coinCandles.ts} / ${span}) * ${span}`;
    const rows = await db
        .select({
            ts: sql<number>`${bucket}`.as("ts"),
            o: sql<number>`(array_agg(${coinCandles.o} ORDER BY ${coinCandles.ts} ASC))[1]`,
            h: sql<number>`max(${coinCandles.h})`,
            l: sql<number>`min(${coinCandles.l})`,
            c: sql<number>`(array_agg(${coinCandles.c} ORDER BY ${coinCandles.ts} DESC))[1]`,
            v: sql<number>`sum(coalesce(${coinCandles.v}, 0))`,
        })
        .from(coinCandles)
        .where(where)
        .groupBy(sql`1`)
        .orderBy(sql`1 asc`)
        .limit(limit);

    return rows;
}

/** Newest stored bar for a series, or null — the sync's incremental cursor. */
export async function latestCandleTs(
    network: string,
    poolAddress: string,
    resolution: StoredResolution,
): Promise<number | null> {
    const [row] = await db
        .select({ ts: sql<number>`max(${coinCandles.ts})` })
        .from(coinCandles)
        .where(
            and(
                eq(coinCandles.network, network),
                eq(coinCandles.poolAddress, poolAddress),
                eq(coinCandles.resolution, resolution),
            ),
        );
    return row?.ts ?? null;
}

/** Upsert bars. Idempotent on the natural key, so re-fetching an overlapping
 *  window corrects the in-flight bar instead of duplicating it. */
export async function writeCandles(
    network: string,
    poolAddress: string,
    resolution: StoredResolution,
    candles: Candle[],
): Promise<number> {
    if (candles.length === 0) return 0;
    await db
        .insert(coinCandles)
        .values(candles.map((c) => ({ network, poolAddress, resolution, ...c })))
        .onConflictDoUpdate({
            target: [coinCandles.network, coinCandles.poolAddress, coinCandles.resolution, coinCandles.ts],
            set: {
                o: sql`excluded.o`,
                h: sql`excluded.h`,
                l: sql`excluded.l`,
                c: sql`excluded.c`,
                v: sql`excluded.v`,
            },
        });
    return candles.length;
}
