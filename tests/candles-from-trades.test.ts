import { describe, expect, test } from "bun:test";
import { tradePriceUsd } from "@/lib/coins/candles-from-trades";

/**
 * Candles projected from the trade tape.
 *
 * `subscribeCandles` drives live bars off postgres_changes on `coin_candles`,
 * so an open chart advances when a candle ROW IS WRITTEN — liveness costs a
 * database write, never an API call. Until 0c1d2b29 the only writer was a
 * GeckoTerminal poll; removing it left charts loading history and freezing.
 * These trades are already arriving, so the bar is derived rather than bought
 * back at 5 credits a call.
 */
describe("tradePriceUsd", () => {
    test("price is usd per token", () => {
        expect(tradePriceUsd(100, 50)).toBe(2);
        expect(tradePriceUsd(1, 4)).toBe(0.25);
    });

    test("a SELL's negative token amount still prices positive", () => {
        // The tape stores signed amounts on some paths. A negative price would
        // draw a candle below zero and rescale the whole chart.
        expect(tradePriceUsd(100, -50)).toBe(2);
    });

    test("unusable inputs are null, never a guess", () => {
        // A fabricated price draws a candle that never traded — the same rule
        // as `priceUsd: null` on tape-sourced PoolTrade.
        expect(tradePriceUsd(null, 10)).toBeNull();
        expect(tradePriceUsd(100, null)).toBeNull();
        expect(tradePriceUsd(0, 10)).toBeNull();
        expect(tradePriceUsd(100, 0)).toBeNull();
        expect(tradePriceUsd(NaN, 10)).toBeNull();
    });
});

/**
 * The merge rules, asserted as the SQL expresses them. Getting these wrong is
 * silent: the chart still renders, it just renders the wrong shape.
 *
 *   o  never updated  — the open belongs to whichever trade opened the bar
 *   h  greatest(...)  — widen
 *   l  least(...)     — widen
 *   c  excluded.c     — move to the newest price
 *   v  accumulate
 */
describe("bar merge semantics", () => {
    const merge = (
        cur: { o: number; h: number; l: number; c: number; v: number },
        next: { h: number; l: number; c: number; v: number },
    ) => ({
        o: cur.o,
        h: Math.max(cur.h, next.h),
        l: Math.min(cur.l, next.l),
        c: next.c,
        v: cur.v + next.v,
    });

    test("a later delivery widens the range and moves only the close", () => {
        const bar = merge({ o: 10, h: 12, l: 9, c: 11, v: 100 }, { h: 15, l: 8, c: 14, v: 50 });
        expect(bar).toEqual({ o: 10, h: 15, l: 8, c: 14, v: 150 });
    });

    test("the OPEN never moves — this is the one that flattens a candle", () => {
        // Overwriting `o` per delivery makes each batch's first trade the open,
        // collapsing the bar toward a line.
        const bar = merge({ o: 10, h: 10, l: 10, c: 10, v: 1 }, { h: 99, l: 1, c: 50, v: 1 });
        expect(bar.o).toBe(10);
    });

    test("a delivery entirely inside the range changes only close and volume", () => {
        const bar = merge({ o: 10, h: 20, l: 5, c: 15, v: 10 }, { h: 16, l: 14, c: 14, v: 3 });
        expect(bar).toEqual({ o: 10, h: 20, l: 5, c: 14, v: 13 });
    });
});
