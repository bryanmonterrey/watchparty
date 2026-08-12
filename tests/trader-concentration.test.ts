import { describe, expect, test } from "bun:test";

import {
    MIN_TRADES_FOR_VERDICT,
    ROUND_TRIP_WASHY_PCT,
    TOP5_SHARE_WASHY_PCT,
    statsFromTrades,
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

describe("volume share", () => {
    const base = { trades: 100, traders: 50, top5Trades: 30, roundTripTraders: 10 };

    test("is null when no priced volume was supplied — not zero", () => {
        // "We don't know" and "nobody holds any of it" are different answers,
        // and a UI that renders 0% for the first one is lying.
        expect(traderConcentration(base).top5VolumeSharePct).toBeNull();
        expect(traderConcentration({ ...base, volumeUsd: 0, top5VolumeUsd: 0 }).top5VolumeSharePct).toBeNull();
    });

    test("computes the top-5 dollar share when volume is present", () => {
        const c = traderConcentration({ ...base, volumeUsd: 1000, top5VolumeUsd: 800 });
        expect(c.top5VolumeSharePct).toBeCloseTo(80, 5);
    });

    test("does NOT drive the verdict", () => {
        // The measurement that decided this: volume share runs a median +35
        // points above count share and sits at 60-100% for healthy tokens too,
        // so a coin can be broadly traded and still show ~100% of dollars in
        // five wallets. Counts are what separate the concentrated from the broad.
        const c = traderConcentration({ ...base, volumeUsd: 1000, top5VolumeUsd: 1000 });
        expect(c.top5VolumeSharePct).toBe(100);
        expect(c.washy).toBe(false); // count share is 30%, comfortably healthy
    });

    test("cannot exceed 100 even if the caller's top5 overshoots the total", () => {
        const c = traderConcentration({ ...base, volumeUsd: 500, top5VolumeUsd: 900 });
        expect(c.top5VolumeSharePct).toBe(100);
    });
});

/**
 * `statsFromTrades` is the half that used to be SQL against `coin_trades`.
 *
 * It moved into TypeScript when the card came off our Helius-fed tape and onto
 * Mobula's trades endpoint, and these cases are the ones the SQL could never be
 * tested for: which wallet a swap belongs to, and the two DIFFERENT top-5 sets.
 */
describe("statsFromTrades", () => {
    const buy = (account: string, usdValue = 0) => ({ account, isBuy: true, usdValue });
    const sell = (account: string, usdValue = 0) => ({ account, isBuy: false, usdValue });

    test("counts trades per wallet, not rows per address string", () => {
        const s = statsFromTrades([buy("a"), buy("a"), sell("a"), buy("b")]);
        expect(s.trades).toBe(4);
        expect(s.traders).toBe(2);
    });

    test("round-trip means BOTH sides — buying twice is not one", () => {
        const s = statsFromTrades([buy("a"), buy("a"), buy("b"), sell("b")]);
        expect(s.roundTripTraders).toBe(1);
    });

    test("top-5 by COUNT is a different set from top-5 by VOLUME", () => {
        // One whale with a single huge trade, five bots with many small ones.
        // Scoring the whale as a cluster is exactly the false positive the
        // count-based verdict exists to avoid.
        const bots = ["b1", "b2", "b3", "b4", "b5"].flatMap((b) =>
            Array.from({ length: 10 }, () => buy(b, 10)),
        );
        const s = statsFromTrades([...bots, buy("whale", 1_000_000)]);
        expect(s.trades).toBe(51);
        // The busiest five are the bots: 50 of the 51 trades.
        expect(s.top5Trades).toBe(50);
        // The largest five by dollars include the whale, who is 99.5% of volume.
        expect(s.top5VolumeUsd).toBeGreaterThan(1_000_000);
        expect(traderConcentration(s).top5VolumeSharePct).toBeGreaterThan(99);
    });

    test("an empty list is no verdict, never a clean one", () => {
        const c = traderConcentration(statsFromTrades([]));
        expect(c.hasVerdict).toBe(false);
        expect(c.washy).toBe(false);
    });

    test("survives missing accounts and unpriced trades", () => {
        const s = statsFromTrades([
            { account: "", isBuy: true },
            { account: "a", isBuy: true },
            { account: "a", isBuy: false, usdValue: NaN },
        ]);
        expect(s.trades).toBe(2);
        expect(s.traders).toBe(1);
        // No priced trade anywhere → volume share is unknown, not zero.
        expect(s.volumeUsd).toBe(0);
        expect(traderConcentration(s).top5VolumeSharePct).toBeNull();
    });
});
