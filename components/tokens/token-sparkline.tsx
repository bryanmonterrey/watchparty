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

/** Points → an SVG path, normalised to the viewBox. Null under two points,
 *  since one price isn't a line. */
function toPath(values: number[]): string | null {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A dead-flat series would divide by zero; draw it down the middle instead.
    const span = max - min || 1;
    const step = W / (values.length - 1);
    return values
        .map((v, i) => {
            const x = i * step;
            const y = PAD + (H - PAD * 2) * (1 - (v - min) / span);
            return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ");
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
