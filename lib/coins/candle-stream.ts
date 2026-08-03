"use client";

import { getRealtimeClient } from "@/lib/supabase/realtime-client";
// The server-free module, NOT lib/coins/candles — that one is `server-only`.
import { sourceResolution, barSeconds } from "@/lib/coins/candle-resolution";

/** A bar in the shape the TradingView library wants. */
export type LiveBar = { time: number; open: number; high: number; low: number; close: number; volume: number };

type CandleRow = {
    network: string;
    pool_address: string;
    resolution: string;
    ts: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number | null;
};

/**
 * Push new bars into an open chart — Phase 2 of docs/live-charts-plan.
 *
 * Subscribes to coin_candles writes for ONE pool over the same Supabase
 * Realtime channel the alerts rail uses, so the chart advances as the sync
 * writes rather than on the library's 30-second poll.
 *
 * Two things the fold has to get right:
 *
 * 1. Only the SOURCE tier is stored (1m / 1h / 1D), so a chart on 5m or 4h has
 *    to roll the incoming bar up itself — same bucketing the SQL read path uses,
 *    or the live bar wouldn't line up with the history beside it.
 * 2. The library expects `time` in MILLISECONDS, while everything server-side is
 *    unix seconds. Getting this wrong doesn't error; it silently plots bars in
 *    1970.
 */
export function subscribeCandles(
    network: string,
    poolAddress: string,
    resolution: string,
    onBar: (bar: LiveBar) => void,
): () => void {
    const source = sourceResolution(resolution);
    const span = barSeconds(resolution);

    const client = getRealtimeClient();
    // Channel name carries the pool so two open charts don't share a topic.
    const channel = client
        .channel(`candles:${network}:${poolAddress}:${source}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "coin_candles",
                // Server-side filter: Realtime supports one `eq`, so it's the
                // pool — the column that narrows hardest. Network and resolution
                // are checked below, since a pool address is effectively unique
                // anyway and the extra rows are negligible.
                filter: `pool_address=eq.${poolAddress}`,
            },
            (payload) => {
                const row = payload.new as CandleRow | undefined;
                if (!row || row.resolution !== source || row.network !== network) return;

                // Bucket the source bar up to the displayed resolution. At the
                // exact tier this is the identity.
                const bucket = Math.floor(row.ts / span) * span;
                onBar({
                    time: bucket * 1000,
                    open: row.o,
                    high: row.h,
                    low: row.l,
                    close: row.c,
                    volume: row.v ?? 0,
                });
            },
        )
        .subscribe();

    return () => {
        void client.removeChannel(channel);
    };
}
