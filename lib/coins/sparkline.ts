/**
 * Sparkline geometry — the 24h mini-chart in a coin row.
 *
 * Pure and React-free so `tests/sparkline.test.ts` can import it without
 * dragging the component tree into the test path (same reason `meetsTier()`
 * lives in `lib/premium/tiers.ts`).
 *
 * ## Borrowed ideas, own implementation
 *
 * Modelled on the inline chart in `solana-foundation/tokens`, which is worth
 * reading. Two of its ideas are the difference between a legible 32px chart and
 * a flat line, and both are reimplemented here:
 *
 *   - **monotone cubic interpolation**, so the curve is smooth without the
 *     overshoot a naive Catmull-Rom gives — an invented dip below a real low
 *     reads as a price that never happened;
 *   - **an exaggerated range**, because a coin that moved 0.4% over a day is a
 *     flat line under a true-zero axis, and "no data" and "no movement" then
 *     look identical.
 *
 * What is deliberately NOT borrowed is its renderer. That component wraps
 * `liveline` and a five-deep query fallback chain specific to their data model.
 * A sparkline is one SVG path, and this app has a 10 MiB gzip worker ceiling —
 * so no dependency, and the caller owns the data.
 */

export interface SparkPoint {
    /** Unix seconds. Only used for ordering and spacing. */
    t: number;
    /** Close price. */
    c: number;
}

/** Below this there is no line to draw — one point is a dot, zero is nothing. */
export const MIN_SPARK_POINTS = 2;

/**
 * Vertical range for the plot, widened so small moves stay visible.
 *
 * A true min/max would render a 0.4% day as a perfectly flat line, which is
 * indistinguishable from "we have no data" — the failure this exists to avoid.
 * A floor of 2% of the value keeps that day readable as the gentle drift it was
 * without pretending it was a rally.
 */
export function sparkRange(values: readonly number[]): { min: number; max: number } {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const v of values) {
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };

    const span = max - min;
    // `|| 0.04` catches a perfectly flat series, where 2% of zero span is zero
    // and every point would land on one pixel row.
    const floor = span * 0.02 || Math.abs(max) * 0.02 || 0.04;
    if (span < floor) {
        const mid = (min + max) / 2;
        return { min: mid - floor / 2, max: mid + floor / 2 };
    }
    const margin = span * 0.06; // keeps the stroke off the top and bottom edges
    return { min: min - margin, max: max + margin };
}

/**
 * Monotone cubic tangents (Fritsch–Carlson).
 *
 * The clamping step is the whole point: without it a cubic through noisy points
 * overshoots, and on a price chart an overshoot draws a low that never traded.
 * Exported for the test, which asserts exactly that.
 */
export function monotoneTangents(values: readonly number[]): number[] {
    const n = values.length;
    if (n < 2) return new Array(n).fill(0);

    const delta: number[] = [];
    for (let i = 0; i < n - 1; i++) delta.push(values[i + 1] - values[i]);

    const m: number[] = new Array(n);
    m[0] = delta[0];
    m[n - 1] = delta[n - 2];
    for (let i = 1; i < n - 1; i++) {
        // A local extremum gets a flat tangent — that is what stops the curve
        // sailing past the point it is meant to touch.
        m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
    }

    for (let i = 0; i < n - 1; i++) {
        if (delta[i] === 0) {
            m[i] = 0;
            m[i + 1] = 0;
            continue;
        }
        const a = m[i] / delta[i];
        const b = m[i + 1] / delta[i];
        const s = a * a + b * b;
        if (s > 9) {
            const scale = 3 / Math.sqrt(s);
            m[i] = scale * a * delta[i];
            m[i + 1] = scale * b * delta[i];
        }
    }
    return m;
}

/**
 * An SVG path for `points` inside a `width` x `height` box.
 *
 * Returns `""` when there is nothing drawable, so the caller renders its empty
 * state rather than an `M NaN` path — which browsers drop silently, making a
 * broken chart look like an empty one.
 */
export function sparkPath(
    points: readonly SparkPoint[],
    width: number,
    height: number,
    strokeWidth = 1.5,
): string {
    const clean = points.filter((p) => Number.isFinite(p.c) && p.c > 0 && Number.isFinite(p.t));
    if (clean.length < MIN_SPARK_POINTS || width <= 0 || height <= 0) return "";

    const sorted = [...clean].sort((a, b) => a.t - b.t);
    const values = sorted.map((p) => p.c);
    const { min, max } = sparkRange(values);
    const span = max - min || 1;

    // Inset by half the stroke so the line is not clipped at the edges.
    const pad = strokeWidth / 2;
    const w = Math.max(1, width - strokeWidth);
    const h = Math.max(1, height - strokeWidth);

    // Indexed spacing, not time-proportional: candles are evenly spaced by
    // construction, and a gap in the series should read as a gap in the LINE
    // rather than silently stretching its neighbours across the hole.
    const x = (i: number) => pad + (i / (sorted.length - 1)) * w;
    const y = (v: number) => pad + (1 - (v - min) / span) * h;

    const m = monotoneTangents(values);
    let d = `M ${x(0).toFixed(2)} ${y(values[0]).toFixed(2)}`;
    for (let i = 0; i < sorted.length - 1; i++) {
        const x0 = x(i);
        const x1 = x(i + 1);
        const dx = (x1 - x0) / 3;
        // Tangents are in value-per-index; convert to value-per-pixel for the
        // control points by scaling with the same dx.
        const c1x = x0 + dx;
        const c1y = y(values[i] + m[i] / 3);
        const c2x = x1 - dx;
        const c2y = y(values[i + 1] - m[i + 1] / 3);
        d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${x1.toFixed(2)} ${y(values[i + 1]).toFixed(2)}`;
    }
    return d;
}

/**
 * Direction over the window — what colours the line.
 *
 * Taken from the SERIES rather than from a `priceChange24h` field on purpose:
 * the two disagree when the series covers a different window, and a green line
 * that visibly falls is worse than either alone.
 */
export function sparkDirection(points: readonly SparkPoint[]): "up" | "down" | "flat" {
    const clean = points.filter((p) => Number.isFinite(p.c) && p.c > 0);
    if (clean.length < MIN_SPARK_POINTS) return "flat";
    const sorted = [...clean].sort((a, b) => a.t - b.t);
    const first = sorted[0].c;
    const last = sorted[sorted.length - 1].c;
    if (last > first) return "up";
    if (last < first) return "down";
    return "flat";
}
