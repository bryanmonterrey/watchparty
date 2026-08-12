/**
 * Build candles from the trade tape, so an open chart keeps advancing.
 *
 * ## The regression this repairs
 *
 * `subscribeCandles` (lib/coins/candle-stream.ts) drives live bars off
 * `postgres_changes` on `coin_candles` — an open chart advances the moment a
 * candle row is WRITTEN. Liveness never cost an API call; it costs a database
 * write.
 *
 * Which means the writer is load-bearing, and until 0c1d2b29 the only writer
 * was `runCandleSync` polling GeckoTerminal. Turning that off to get GT out of
 * the app left charts loading their history and then freezing — the read path
 * persists a coin's backfill on first open, and nothing ever appended to it.
 *
 * ## Deriving them instead of fetching them
 *
 * A candle is just trades bucketed by time, so the bar can be computed from
 * data we already hold rather than bought back from a provider at 5 credits a
 * call. It is also FASTER than what it replaces: a synced candle appeared
 * whenever the next cron pass ran, this one lands on the tape's cadence.
 *
 * ## Who calls this, and what changed
 *
 * `lib/coins/record-mobula-trades` — the trades the COIN PAGE already fetches
 * every 30s, so any coin someone is looking at ticks. This is the path that
 * matters day to day, and it is free: the request was already made for the
 * table under the chart.
 *
 * `app/api/webhooks/mobula-trades` — the Tape DO's push, once Mobula's socket
 * is on a plan that allows it. Sub-second, and it does not need anyone watching.
 *
 * NOT `lib/coins/record-swaps` any more. That is the Helius webhook's path, and
 * Helius does not power the coin page — it is this app's operations provider.
 * It kept 33 pools' bars fresh (measured 2026-08-12) and, worse, its freshness
 * masked a bug in the READ path, where stored bars were served without any
 * staleness check: those 33 charts looked live and every other chart in the app
 * had been frozen since the minute it was first opened.
 */

import { db } from "@/db";
import { coinCandles } from "@/db/schema/content/coin-candles";
import { sql } from "drizzle-orm";

/** Resolutions the chart reads. "1" is the source bar `subscribeCandles`
 *  buckets up from, so writing it is what makes every higher tier advance. */
const RESOLUTIONS = [
    { key: "1", seconds: 60 },
    { key: "60", seconds: 3_600 },
] as const;

export interface TapeTrade {
    network: string;
    poolAddress: string;
    /** Unix SECONDS — matches `coin_trades.ts`. */
    ts: number;
    /** Price in USD for this trade. */
    priceUsd: number;
    /** Token amount, for volume. */
    amountToken?: number | null;
}

/**
 * Upsert the bars these trades fall into.
 *
 * OHLC is merged against whatever is already stored rather than overwritten:
 * a bar is built from many trades arriving across many deliveries, so the
 * update must widen high/low and move only the close. Overwriting would make
 * each delivery's first trade the bar's open and flatten the candle to a line.
 */
export async function updateCandlesFromTrades(trades: readonly TapeTrade[]): Promise<number> {
    const usable = trades.filter(
        (t) => Number.isFinite(t.priceUsd) && t.priceUsd > 0 && Number.isFinite(t.ts) && t.ts > 0,
    );
    if (!usable.length) return 0;

    type Bar = { network: string; poolAddress: string; resolution: string; ts: number; o: number; h: number; l: number; c: number; v: number };
    const bars = new Map<string, Bar>();

    for (const res of RESOLUTIONS) {
        // Oldest first, so the LAST trade written into a bucket is genuinely
        // the latest — `c` must be the most recent price, and the tape can
        // deliver a batch in any order.
        for (const t of [...usable].sort((a, b) => a.ts - b.ts)) {
            const bucket = Math.floor(t.ts / res.seconds) * res.seconds;
            const key = `${t.network}|${t.poolAddress}|${res.key}|${bucket}`;
            const cur = bars.get(key);
            if (!cur) {
                bars.set(key, {
                    network: t.network,
                    poolAddress: t.poolAddress,
                    resolution: res.key,
                    ts: bucket,
                    o: t.priceUsd,
                    h: t.priceUsd,
                    l: t.priceUsd,
                    c: t.priceUsd,
                    v: Math.abs(t.amountToken ?? 0),
                });
                continue;
            }
            cur.h = Math.max(cur.h, t.priceUsd);
            cur.l = Math.min(cur.l, t.priceUsd);
            cur.c = t.priceUsd;
            cur.v += Math.abs(t.amountToken ?? 0);
        }
    }

    const rows = [...bars.values()];
    if (!rows.length) return 0;

    await db
        .insert(coinCandles)
        .values(rows)
        .onConflictDoUpdate({
            target: [coinCandles.network, coinCandles.poolAddress, coinCandles.resolution, coinCandles.ts],
            set: {
                // `o` is deliberately absent: the open is set by whichever
                // trade opened the bar and must never move afterwards.
                h: sql`greatest(${coinCandles.h}, excluded.h)`,
                l: sql`least(${coinCandles.l}, excluded.l)`,
                c: sql`excluded.c`,
                v: sql`coalesce(${coinCandles.v}, 0) + coalesce(excluded.v, 0)`,
            },
        });

    return rows.length;
}

/** Price per token from the amounts the tape stores. Null when it cannot be
 *  computed — a fabricated price would draw a candle that never traded. */
export function tradePriceUsd(amountUsd: number | null, amountToken: number | null): number | null {
    if (!Number.isFinite(amountUsd ?? NaN) || !Number.isFinite(amountToken ?? NaN)) return null;
    const usd = amountUsd as number;
    const tok = Math.abs(amountToken as number);
    if (usd <= 0 || tok <= 0) return null;
    return usd / tok;
}
