import { and, asc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { coinCandles } from "@/db/schema/content/coin-candles";

/**
 * 24h sparkline bars for a page of board rows, in ONE query.
 *
 * The same projection `trending.list` uses, lifted here so /trade's two feeds
 * — the in-house board and the chain-wide passthrough — can share it. Both
 * carry `poolAddress` (chain rows map Mobula's `pairAddress` onto it), and
 * the bars are already in `coin_candles`, written by the trade tape, so this
 * costs one read per page rather than one per row.
 *
 * Hourly bars ("60"), and the window is SEVEN DAYS rather than one.
 *
 * Measured on prod 2026-08-21: 13 pools have hourly bars inside 24h, 265
 * inside a week, 447 inside a month — so a 24h window drew a dash on
 * essentially every row while the series existed a little further back. The
 * column carries no time label, so a longer reach is not a lie on screen; it
 * is the same widening tokens.xyz does when an asset has not traded
 * continuously (their fallbackDays), and a 28px chart reads shape, not dates.
 * The real fix for freshness is recording more pools — see the coverage note
 * below.
 *
 * ## Coverage is honest, not complete
 *
 * The tape holds the pools we watch; the chain board shows whatever Mobula
 * ranks. Those sets overlap only where a coin is both. A pool with no bars
 * gets an empty array and CoinSparkline draws an em-dash — which is the
 * component's whole reason for distinguishing "no series" from "no movement".
 *
 * The KEY is right, in case this ever looks broken: candles are stored per
 * POOL, and 229 of trending_coins' rows join to them on pool_address. What
 * is thin is the recording — /api/cron/tape-watch, which subscribes Mobula's
 * socket to the top board MINTS (the pool is resolved per trade as it is
 * written), has never been scheduled, so almost nothing fresh arrives.
 *
 * ## Never throws
 *
 * A missing chart must not take the board down with it. Any failure resolves
 * to an empty map, and every row simply renders its em-dash.
 */
export type SparkBar = { t: number; c: number };

export async function sparkByPool(pools: readonly (string | null | undefined)[]) {
    const wanted = [...new Set(pools.filter(Boolean) as string[])];
    const out = new Map<string, SparkBar[]>();
    if (wanted.length === 0) return out;

    try {
        const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
        const bars = await db
            .select({ poolAddress: coinCandles.poolAddress, ts: coinCandles.ts, c: coinCandles.c })
            .from(coinCandles)
            .where(
                and(
                    eq(coinCandles.resolution, "60"),
                    gte(coinCandles.ts, since),
                    inArray(coinCandles.poolAddress, wanted),
                ),
            )
            .orderBy(asc(coinCandles.ts));

        for (const b of bars) {
            const arr = out.get(b.poolAddress) ?? [];
            arr.push({ t: b.ts, c: b.c });
            out.set(b.poolAddress, arr);
        }
    } catch (err) {
        console.error("[spark] bars read failed:", err instanceof Error ? err.message : err);
    }
    return out;
}
