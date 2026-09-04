import { describe, expect, test } from "bun:test";

import { pickBurstOffender } from "@/lib/tokens/trades-breaker";

/**
 * The 2026-09-04 incident, in numbers: one watched mint (TROLL) delivering
 * ~1,400/min against a 16/min budget, seven others near zero. The breaker has
 * to name that one address and nothing else.
 */
const WATCHED = new Set(["TROLL", "A", "B", "C"]);

describe("pickBurstOffender", () => {
    test("names the one address carrying the burst", () => {
        const counts = new Map([["TROLL", 1400], ["A", 2], ["B", 0], ["C", 1]]);
        expect(pickBurstOffender(counts, WATCHED, 160)).toBe("TROLL");
    });

    test("stays quiet under the threshold", () => {
        const counts = new Map([["TROLL", 40], ["A", 30], ["B", 20]]);
        expect(pickBurstOffender(counts, WATCHED, 160)).toBeNull();
    });

    test("ignores addresses we don't watch — a swap touches ~20 accounts", () => {
        const counts = new Map([["SomeDexProgram", 5000], ["A", 3]]);
        expect(pickBurstOffender(counts, WATCHED, 160)).toBeNull();
    });

    test("won't shed when the load is spread — one removal wouldn't fix it", () => {
        const counts = new Map([["TROLL", 60], ["A", 60], ["B", 60], ["C", 60]]);
        expect(pickBurstOffender(counts, WATCHED, 160)).toBeNull();
    });

    test("a zero or missing threshold disables it", () => {
        const counts = new Map([["TROLL", 1400]]);
        expect(pickBurstOffender(counts, WATCHED, 0)).toBeNull();
        expect(pickBurstOffender(counts, WATCHED, NaN)).toBeNull();
    });
});
