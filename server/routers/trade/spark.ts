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
 * Hourly bars ("60") over 24h: 24 points, enough shape for a 28px chart and
 * small enough to ship inline rather than as a second round trip.
 *
 * ## Coverage is honest, not complete
 *
 * The tape holds the pools we watch; the chain board shows whatever Mobula
 * ranks. Those sets overlap only where a coin is both. A pool with no bars
 * gets an empty array and CoinSparkline draws an em-dash — which is the
 * component's whole reason for distinguishing "no series" from "no movement".
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
        const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
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
