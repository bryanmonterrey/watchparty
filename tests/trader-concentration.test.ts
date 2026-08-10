import { describe, expect, test } from "bun:test";

import {
    MIN_TRADES_FOR_VERDICT,
    ROUND_TRIP_WASHY_PCT,
    TOP5_SHARE_WASHY_PCT,
    traderConcentration,
} from "@/lib/coin-feed/trader-concentration";

/**
 * The cases below are the real rows measured off `coin_trades` on 2026-08-10,
 * because a threshold justified by invented numbers is just a preference.
 *
 * As with every gate in this feed, the tests are mostly about REFUSING: a coin
 * with too little activity must come back "no verdict", never "clean" and never
 * "washy". Getting that backwards would either hide every new coin or wave
 * through the wash trading this exists to catch.
 */

describe("traderConcentration", () => {
    test("the worst real token: 5 wallets, 82% of trades", () => {
        const c = traderConcentration({ trades: 74, traders: 18, top5Trades: 61, roundTripTraders: 3 });
        expect(Math.round(c.top5SharePct)).toBe(82);
        expect(c.hasVerdict).toBe(true);
        expect(c.washy).toBe(true);
    });

    test("caught by round-trips even when top-5 share alone would pass", () => {
        // 47 trades / 17 traders, top5 61.7%, round-trip 41.2% — the two axes
        // are not redundant, which is why the predicate is an OR.
        const c = traderConcentration({ trades: 47, traders: 17, top5Trades: 29, roundTripTraders: 7 });
        expect(c.roundTripPct).toBeGreaterThanOrEqual(ROUND_TRIP_WASHY_PCT);
        expect(c.washy).toBe(true);
    });

    test("the healthiest real token: 537 traders, 23% top-5", () => {
        const c = traderConcentration({ trades: 1306, traders: 537, top5Trades: 299, roundTripTraders: 75 });
        expect(Math.round(c.top5SharePct)).toBe(23);
        expect(c.washy).toBe(false);
        expect(c.hasVerdict).toBe(true);
    });

    test("a mid token passes both axes", () => {
        const c = traderConcentration({ trades: 255, traders: 105, top5Trades: 90, roundTripTraders: 30 });
        expect(c.washy).toBe(false);
    });

    test("NO VERDICT below the trade floor, however concentrated", () => {
        // Two wallets and four trades is 100% top-5 concentration and means
        // nothing at all. Same sample-size trap as buy pressure.
        const c = traderConcentration({ trades: 4, traders: 2, top5Trades: 4, roundTripTraders: 2 });
        expect(c.top5SharePct).toBe(100);
        expect(c.hasVerdict).toBe(false);
        expect(c.washy).toBe(false);
    });

    test("the floor is inclusive", () => {
        const at = traderConcentration({
            trades: MIN_TRADES_FOR_VERDICT, traders: 3, top5Trades: MIN_TRADES_FOR_VERDICT, roundTripTraders: 0,
        });
        expect(at.hasVerdict).toBe(true);
        expect(at.washy).toBe(true);
    });

    test("missing or empty input is no verdict, never a judgement", () => {
        for (const input of [null, undefined, { trades: 0, traders: 0, top5Trades: 0, roundTripTraders: 0 }]) {
            const c = traderConcentration(input);
            expect(c.hasVerdict).toBe(false);
            expect(c.washy).toBe(false);
        }
    });

    test("survives impossible input without dividing by zero or exceeding 100%", () => {
        // Providers send nonsense. top5Trades > trades and roundTrip > traders
        // are both clamped rather than producing a 250% share.
        const c = traderConcentration({ trades: 50, traders: 10, top5Trades: 900, roundTripTraders: 900 });
        expect(c.top5SharePct).toBe(100);
        expect(c.roundTripPct).toBe(100);
        expect(Number.isFinite(c.tradesPerTrader)).toBe(true);

        const bad = traderConcentration({ trades: NaN, traders: 5, top5Trades: 1, roundTripTraders: 1 });
        expect(bad.hasVerdict).toBe(false);
    });

    test("thresholds are the measured ones", () => {
        // Pinned so a future tweak is a deliberate edit with a diff, not a drift.
        expect(TOP5_SHARE_WASHY_PCT).toBe(60);
        expect(ROUND_TRIP_WASHY_PCT).toBe(40);
        expect(MIN_TRADES_FOR_VERDICT).toBe(40);
    });
});
