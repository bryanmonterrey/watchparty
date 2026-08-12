import { describe, expect, test } from "bun:test";

import {
    MIN_SPARK_POINTS,
    monotoneTangents,
    sparkDirection,
    sparkPath,
    sparkRange,
    type SparkPoint,
} from "@/lib/coins/sparkline";

/**
 * The 24h sparkline's geometry. Two properties carry the whole thing:
 * monotonicity (a curve must not draw a price that never traded) and the
 * exaggerated range (a flat line and no data must not look identical).
 */

const series = (...vals: number[]): SparkPoint[] => vals.map((c, i) => ({ t: 1_700_000_000 + i * 3600, c }));

describe("sparkRange", () => {
    test("widens a nearly-flat series so it is still visible", () => {
        // 0.4% over a day. Under a true min/max this is one pixel row, which
        // reads as "no data" rather than "no movement".
        const { min, max } = sparkRange([100, 100.2, 100.4]);
        expect(max - min).toBeGreaterThan(0.4);
    });

    test("a PERFECTLY flat series still has height", () => {
        // span is 0, so a 2%-of-span floor is also 0 — every point would land
        // on the same row and the path would be a horizontal hairline.
        const { min, max } = sparkRange([50, 50, 50]);
        expect(max).toBeGreaterThan(min);
    });

    test("a real move is not distorted — margin only, no floor", () => {
        const { min, max } = sparkRange([100, 200]);
        expect(min).toBeLessThan(100);
        expect(max).toBeGreaterThan(200);
        // 6% margin each side, nothing like the 2% floor kicking in.
        expect(max - min).toBeLessThan(130);
    });

    test("no finite values is a usable range, not NaN", () => {
        const { min, max } = sparkRange([NaN, Infinity]);
        expect(Number.isFinite(min)).toBe(true);
        expect(Number.isFinite(max)).toBe(true);
    });
});

describe("monotoneTangents", () => {
    test("a local peak gets a FLAT tangent — this is what stops overshoot", () => {
        // Rising then falling. Without clamping, a cubic sails past the peak
        // and draws a high that never traded.
        const m = monotoneTangents([1, 5, 1]);
        expect(m[1]).toBe(0);
    });

    test("a monotone rise keeps positive tangents throughout", () => {
        const m = monotoneTangents([1, 2, 3, 4]);
        expect(m.every((v) => v >= 0)).toBe(true);
    });

    test("a flat run is flat, not drifting", () => {
        expect(monotoneTangents([7, 7, 7])).toEqual([0, 0, 0]);
    });
});

describe("sparkPath", () => {
    test("never leaves the box — the overshoot property, checked on the OUTPUT", () => {
        // Asserting on tangents proves the maths; this proves the drawing. A
        // control point outside the viewBox is a curve clipped by the svg,
        // which looks like a chart with a bite taken out of it.
        const d = sparkPath(series(10, 90, 10, 90, 10), 100, 40);
        const coords = [...d.matchAll(/(-?\d+\.\d+)\s(-?\d+\.\d+)/g)];
        expect(coords.length).toBeGreaterThan(0);
        for (const [, xs, ys] of coords) {
            expect(Number(xs)).toBeGreaterThanOrEqual(0);
            expect(Number(xs)).toBeLessThanOrEqual(100);
            expect(Number(ys)).toBeGreaterThanOrEqual(0);
            expect(Number(ys)).toBeLessThanOrEqual(40);
        }
    });

    test("empty string when there is nothing drawable", () => {
        // NOT a partial path: `M NaN ...` is dropped silently by browsers, so a
        // broken chart would render as an empty one.
        expect(sparkPath([], 80, 24)).toBe("");
        expect(sparkPath(series(5), 80, 24)).toBe("");
        expect(sparkPath(series(1, 2), 0, 24)).toBe("");
    });

    test("drops junk points rather than poisoning the path", () => {
        const d = sparkPath([{ t: 1, c: 10 }, { t: 2, c: NaN }, { t: 3, c: 0 }, { t: 4, c: 20 }], 60, 20);
        expect(d).not.toContain("NaN");
        expect(d.startsWith("M ")).toBe(true);
    });

    test("out-of-order candles are sorted, not drawn as a zigzag", () => {
        const jumbled = [{ t: 300, c: 3 }, { t: 100, c: 1 }, { t: 200, c: 2 }];
        expect(sparkPath(jumbled, 60, 20)).toBe(sparkPath(series(1, 2, 3), 60, 20));
    });

    test(`needs ${MIN_SPARK_POINTS} points`, () => {
        expect(sparkPath(series(1), 60, 20)).toBe("");
        expect(sparkPath(series(1, 2), 60, 20)).not.toBe("");
    });
});

describe("sparkDirection", () => {
    test("reads the series, first to last", () => {
        expect(sparkDirection(series(1, 5, 3))).toBe("up");
        expect(sparkDirection(series(5, 1, 2))).toBe("down");
        expect(sparkDirection(series(4, 9, 4))).toBe("flat");
    });

    test("too little data is flat, never a guess", () => {
        expect(sparkDirection([])).toBe("flat");
        expect(sparkDirection(series(3))).toBe("flat");
    });
});
