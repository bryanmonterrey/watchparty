"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";

// The mini price line — a non-interactive sparkline.
//
// NO CHART LIBRARY, deliberately. A static polyline is one <path>; the whole
// thing below is ~40 lines and ships nothing. The alternatives cost real weight
// on the home page, which is the exact thing the speed rule exists to stop:
//
//   · evilcharts is a shadcn-style registry built on Recharts — copy-paste
//     components, not an npm package, and it drags Recharts (~100KB gz) in.
//   · lightweight-charts IS already installed (the wallet and token pages use
//     it), but it's a canvas engine that spins up a chart instance, a resize
//     observer and a time scale per mount. Right for the interactive token
//     chart, absurd for a 96×28 line that never responds to a pointer.
//
// Draws in a 100×28 viewBox stretched to whatever box it's given
// (preserveAspectRatio="none"), with a non-scaling stroke so the line stays
// 1.5px however far it's stretched.

const W = 100;
const H = 28;
const PAD = 2;

/**
 * Points → a SMOOTHED SVG path, normalised to the viewBox. Null under two
 * points, since one price isn't a line.
 *
 * Monotone cubic interpolation (Fritsch–Carlson tangents) — the same curve
 * Recharts draws for `type="monotone"`, which is the thing that actually makes
 * these mini lines look good and the only reason to have considered a chart
 * library. Straight segments read as jagged at 28px tall; a plain Catmull-Rom
 * smooths them but OVERSHOOTS, inventing highs and lows the token never traded
 * at. Monotone can't overshoot: where the data turns, the tangent is forced to
 * zero, so every peak in the curve is a real peak in the series.
 */
function toPath(values: number[]): string | null {
    const n = values.length;
    if (n < 2) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    // A dead-flat series would divide by zero; draw it down the middle instead.
    const span = max - min || 1;
    const step = W / (n - 1);

    const xs = values.map((_, i) => i * step);
    const ys = values.map((v) => PAD + (H - PAD * 2) * (1 - (v - min) / span));

    // Secant slopes between each pair.
    const slope: number[] = [];
    for (let i = 0; i < n - 1; i++) slope[i] = (ys[i + 1] - ys[i]) / step;

    // Tangents. Interior points get the harmonic mean of their two secants, and
    // zero wherever the direction flips — that's what kills the overshoot.
    const t: number[] = new Array(n);
    t[0] = slope[0];
    t[n - 1] = slope[n - 2];
    for (let i = 1; i < n - 1; i++) {
        if (slope[i - 1] * slope[i] <= 0) {
            t[i] = 0;
        } else {
            const w1 = 2 * step + step;
            const w2 = step + 2 * step;
            t[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
        }
    }

    let d = `M${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
    for (let i = 0; i < n - 1; i++) {
        const c1x = xs[i] + step / 3;
        const c1y = ys[i] + (t[i] * step) / 3;
        const c2x = xs[i + 1] - step / 3;
        const c2y = ys[i + 1] - (t[i + 1] * step) / 3;
        d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${xs[i + 1].toFixed(2)} ${ys[i + 1].toFixed(2)}`;
    }
    return d;
}

/** `$—·—` — the "no market cap because it hasn't launched" mark. A dash rather
 *  than a zero: zero is a price, this is the absence of one. */
export function NoMarketCap({ className }: { className?: string }) {
    return (
        <span
            title="not launched yet"
            className={cn("text-[12px] font-extrabold tabular-nums text-zinc-600", className)}
        >
            $—·—
        </span>
    );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
    const d = useMemo(() => toPath(values), [values]);

    // No series yet — a token that hasn't traded. A flat grey line says "not
    // started" without pretending to be data.
    if (!d) {
        return (
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("text-zinc-700", className)} aria-hidden>
                <path
                    d={`M0 ${H / 2} L${W} ${H / 2}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        );
    }

    // Direction is first vs last, not the extremes — that's what the % change
    // beside it reports, and the two disagreeing would look broken.
    const up = values[values.length - 1] >= values[0];

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className={cn(up ? "text-jewel" : "text-pastelred", className)}
            aria-hidden
        >
            <path
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

/**
 * The sparkline for a mint, fetching its own series.
 *
 * Reuses wallet.getChartData — the same GeckoTerminal OHLCV the token page's
 * candlestick chart runs on, Redis-cached server-side, so this adds no new
 * upstream traffic. 1D is 24 hourly candles, which is the right resolution for
 * a 96px line.
 *
 * `mint` null (a token draft with no mint yet) renders the grey not-started
 * line rather than nothing, so the row's height doesn't jump when a coin goes
 * live.
 */
export function TokenSparkline({ mint, className }: { mint?: string | null; className?: string }) {
    const { data: session } = useAuthSession();

    const { data } = trpc.wallet.getChartData.useQuery(
        { mint: mint ?? "", timeframe: "1D" },
        {
            // getChartData is a protected procedure — without a session it would
            // just throw UNAUTHORIZED behind the scenes on every feed row.
            enabled: !!mint && !!session,
            staleTime: 5 * 60 * 1000,
            retry: false,
        },
    );

    const values = useMemo(
        () => (data ?? []).map((c: { close: number }) => c.close).filter((n) => Number.isFinite(n)),
        [data],
    );

    return <Sparkline values={values} className={className} />;
}
