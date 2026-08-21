import { after } from "next/server";
import { and, asc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { coinCandles } from "@/db/schema/content/coin-candles";
import { withCache, TTL } from "@/lib/cache";
import { fetchMobulaCandles } from "@/lib/coins/mobula";
import { writeCandles } from "@/lib/coins/candles";

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
 * POOL, and 229 of trending_coins' rows join to them on pool_address.
 *
 * What is thin is the RECORDING, and it is a PLAN gate, not a missing cron.
 * /api/cron/tape-watch — which subscribes Mobula's socket to the top board
 * MINTS, each trade resolving its own pool as it is written — is dispatched
 * every minute already, and it returns early: Mobula refuses WebSockets below
 * the Growth plan ($400/mo), verified against their live endpoint 2026-08-12
 * and guarded by TAPE_WATCH_ENABLED. So the only writers today are the Helius
 * webhook's few watched mints and record-mobula-trades on coin pages people
 * actually open — which is why 13 pools have a fresh hourly bar and 3,801
 * board rows do not. Nothing here is fixable in this file; it fixes itself
 * the day a socket is allowed.
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

/* ── A line on EVERY row ──────────────────────────────────────────────────
 *
 * The tape alone cannot do it: it records the pools we watch, and the board
 * is whatever Mobula ranks this minute — 13 pools carried a fresh hourly bar
 * against 3,801 board rows when this was measured. The socket that would fix
 * that is behind Mobula's Growth plan, so the remaining source is their REST
 * OHLCV, which is keyed by MINT and works for a coin on a chain we have never
 * indexed.
 *
 * It costs 5 credits a call, so this is written to pay for a coin ONCE:
 *
 *   1. read our own candles first — free, and covers every coin already seen;
 *   2. fetch only the rows still missing, capped per request (SPARK_FETCH_MAX)
 *      so a cold board cannot fan out into a page of paid calls;
 *   3. cache the fetch per mint, so parallel viewers of the same board share
 *      one call rather than multiplying it;
 *   4. WRITE what comes back into coin_candles, after the response — so the
 *      next load reads it for free and the tape grows toward the board it is
 *      actually charting.
 *
 * Failure is per row: a coin whose fetch fails keeps its em-dash and the rest
 * of the board still draws.
 */
const FETCH_BUDGET = Number(process.env.SPARK_FETCH_MAX ?? 30);
/** Enough shape for a 28px chart; the fetch is billed per call, not per bar. */
const HOURS = 168;

export interface SparkRow {
    tokenAddress?: string | null;
    poolAddress?: string | null;
    /** Chain id for board rows; in-house coins are Solana. */
    chain?: string;
}

/** Key a row is looked up by — its pool when we have one, else its mint. */
export function sparkKey(row: SparkRow) {
    return row.poolAddress || row.tokenAddress || "";
}

export async function sparkForRows(rows: readonly SparkRow[]) {
    const out = await sparkByPool(rows.map((r) => r.poolAddress));

    const missing = rows.filter((r) => {
        const held = r.poolAddress ? out.get(r.poolAddress) : undefined;
        return (!held || held.length < 2) && !!r.tokenAddress;
    });
    if (missing.length === 0) return out;

    const to = Math.floor(Date.now() / 1000);
    const from = to - HOURS * 60 * 60;

    const fetched = await Promise.allSettled(
        missing.slice(0, FETCH_BUDGET).map(async (row) => {
            const network = row.chain || "solana";
            const mint = row.tokenAddress!;
            const bars = await withCache(
                `spark:ohlcv:${network}:${mint}`,
                TTL.CHART_OHLCV,
                () => fetchMobulaCandles(mint, network, "60", from, to, HOURS),
            );
            return { row, network, bars: bars ?? [] };
        }),
    );

    for (const result of fetched) {
        if (result.status !== "fulfilled") continue;
        const { row, network, bars } = result.value;
        if (bars.length < 2) continue;

        out.set(sparkKey(row), bars.map((b) => ({ t: b.ts, c: b.c })));

        // Off the response: the reader already has its line, and this is the
        // write that stops the NEXT reader paying for the same coin.
        if (row.poolAddress) {
            const pool = row.poolAddress;
            after(async () => {
                try {
                    await writeCandles(network, pool, "60", bars);
                } catch (err) {
                    console.error("[spark] candle write failed:", err instanceof Error ? err.message : err);
                }
            });
        }
    }

    return out;
}
