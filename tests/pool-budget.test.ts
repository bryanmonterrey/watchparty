import { describe, expect, test } from "bun:test";

import {
    ANY_MULTIPLIER,
    ESTIMATE_INFLATION,
    poolCostPerMin,
    selectPoolsWithinBudget,
} from "@/lib/tokens/pool-budget";

/**
 * This selection is what stands between the trades webhook and another 1M
 * credits in 1.5 days, so the cases below are the real pools off the live board
 * rather than invented ones.
 *
 * The failure it replaces was a COUNT: "top 15 by rank" selected the single most
 * expensive pools on the chain, because rank IS activity.
 */

// Measured 2026-08-10, trending_coins (solana).
const HOOD = { poolAddress: "hood", txns24h: 230_975 };   // 850/min under ANY
const SNDK = { poolAddress: "sndk", txns24h: 118_006 };
const TOAD = { poolAddress: "toad", txns24h: 106_572 };
const RISK = { poolAddress: "risk", txns24h: 42_296 };
const DRAFTKINGS = { poolAddress: "dk", txns24h: 6_257 };
const ANSEM = { poolAddress: "ansem", txns24h: 3_192 };
const PIPPIN = { poolAddress: "pippin", txns24h: 2_203 };
const TROLL = { poolAddress: "troll", txns24h: 1_435 };
const GTAVI = { poolAddress: "gtavi", txns24h: 1_353 };
const DUST = { poolAddress: "dust", txns24h: 40 };

const BOARD = [HOOD, SNDK, TOAD, RISK, DRAFTKINGS, ANSEM, PIPPIN, TROLL, GTAVI, DUST];
const opts = (over: Partial<Parameters<typeof selectPoolsWithinBudget>[1]> = {}) => ({
    budgetPerMin: 12,
    mode: "SWAP" as const,
    minTxns24h: 500,
    ...over,
});

describe("poolCostPerMin", () => {
    test("SWAP is the raw swap rate", () => {
        // 230,975/day ÷ 1440 ≈ 160/min
        expect(Math.round(poolCostPerMin(HOOD.txns24h, "SWAP"))).toBe(160);
    });

    test("ANY applies the measured 5.3x", () => {
        // The multiplier that turned 478/min of swaps into 2,518/min delivered.
        expect(Math.round(poolCostPerMin(HOOD.txns24h, "ANY"))).toBe(850);
        expect(poolCostPerMin(1440, "ANY")).toBeCloseTo(ANY_MULTIPLIER, 5);
    });

    test("absent or nonsense activity costs nothing rather than NaN", () => {
        for (const v of [null, undefined, 0, -5, NaN]) {
            expect(poolCostPerMin(v, "SWAP")).toBe(0);
        }
    });
});

describe("selectPoolsWithinBudget", () => {
    test("THE REGRESSION: never picks the busiest pool", () => {
        // Rank order would have taken HOOD first and blown the budget 70x over.
        const sel = selectPoolsWithinBudget(BOARD, opts());
        expect(sel.addresses).not.toContain("hood");
        expect(sel.estPerMin).toBeLessThanOrEqual(12);
    });

    test("cheapest-first maximises how many pools fit", () => {
        // The budget is asked-for DELIVERIES, and selection divides by
        // ESTIMATE_INFLATION to get the estimate it may spend — so a raw "12"
        // buys ~12/2.7 of estimated rate. Scaling by the constant keeps this
        // test about ORDERING, which is its subject, rather than about the
        // calibration factor, which has its own coverage below.
        const sel = selectPoolsWithinBudget(BOARD, opts({ budgetPerMin: 12 * ESTIMATE_INFLATION }));
        // GTAVI (0.94/min) and TROLL (1.0) are the cheapest above the floor.
        expect(sel.addresses).toContain("gtavi");
        expect(sel.addresses).toContain("troll");
        expect(sel.addresses.length).toBeGreaterThanOrEqual(4);
    });

    test("the budget is what should ACTUALLY arrive, not the raw estimate", () => {
        // The whole point of ESTIMATE_INFLATION: `budgetPerMin` is deliveries
        // per minute as measured, so CLAUDE.md's affordability arithmetic
        // (1,000,000 credits ÷ 30 ÷ 1440 = 23/min at 1 credit each) can be used
        // directly. Before this, asking for 6 produced a measured 16.
        const sel = selectPoolsWithinBudget(BOARD, opts({ budgetPerMin: 12 }));
        const rawEstimate = sel.addresses
            .map((a) => BOARD.find((p) => p.poolAddress === a)!)
            .reduce((sum, p) => sum + poolCostPerMin(p.txns24h, "SWAP"), 0);
        // Spends about a third of the asked-for rate in ESTIMATED terms…
        expect(rawEstimate).toBeLessThanOrEqual(12 / ESTIMATE_INFLATION + 0.001);
        // …so that reality, which runs ~2.7x hot, lands near 12.
        expect(rawEstimate * ESTIMATE_INFLATION).toBeLessThanOrEqual(12.001);
    });

    test("never exceeds the budget, whatever the board looks like", () => {
        for (const budget of [0.5, 1, 5, 12, 50]) {
            const sel = selectPoolsWithinBudget(BOARD, opts({ budgetPerMin: budget }));
            expect(sel.estPerMin).toBeLessThanOrEqual(budget);
        }
    });

    test("ANY admits far fewer pools than SWAP for the same budget", () => {
        // The whole reason mode exists: 5.3x the cost is 5.3x fewer pools.
        const swap = selectPoolsWithinBudget(BOARD, opts({ mode: "SWAP" }));
        const any = selectPoolsWithinBudget(BOARD, opts({ mode: "ANY" }));
        expect(any.addresses.length).toBeLessThan(swap.addresses.length);
        expect(any.estPerMin).toBeLessThanOrEqual(12);
    });

    test("drops pools too quiet to ever produce a verdict", () => {
        // DUST has 40 txns/day — it would cost almost nothing and yield almost
        // nothing, which is worse than not watching it.
        const sel = selectPoolsWithinBudget(BOARD, opts());
        expect(sel.addresses).not.toContain("dust");
        expect(sel.tooQuiet).toBe(1);
    });

    test("a zero budget selects nothing — the old MAX_DISPLAY_POOLS=0 behaviour", () => {
        const sel = selectPoolsWithinBudget(BOARD, opts({ budgetPerMin: 0 }));
        expect(sel.addresses).toEqual([]);
        expect(sel.estPerMin).toBe(0);
    });

    test("survives null addresses, duplicates and an empty board", () => {
        const messy = [
            { poolAddress: null, txns24h: 5_000 },
            TROLL,
            TROLL,
            { poolAddress: "x", txns24h: null },
        ];
        const sel = selectPoolsWithinBudget(messy, opts());
        expect(sel.addresses).toEqual(["troll"]);
        expect(selectPoolsWithinBudget([], opts()).addresses).toEqual([]);
    });

    test("reports what didn't fit, so a wrong budget is visible", () => {
        const sel = selectPoolsWithinBudget(BOARD, opts({ budgetPerMin: 2 }));
        expect(sel.tooBusy).toBeGreaterThan(0);
    });
});
