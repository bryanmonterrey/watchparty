"use client";

// The 24h mini-chart for a coin row — one SVG path, no chart library.
//
// Pattern borrowed from the inline chart in `solana-foundation/tokens`; the
// implementation is ours. Theirs wraps `liveline` plus a five-deep query
// fallback chain built around their data model, and this app has a 10 MiB gzip
// worker ceiling — a sparkline does not earn a dependency.
//
// The geometry lives in `lib/coins/sparkline.ts` so it can be tested without
// React. What stays here is the part that has to be a component: lazy mounting,
// and the empty state.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MIN_SPARK_POINTS, sparkDirection, sparkPath, type SparkPoint } from "@/lib/coins/sparkline";

interface CoinSparklineProps {
    points: readonly SparkPoint[];
    width?: number;
    height?: number;
    /**
     * Override the colour. By default direction is read from the SERIES, not
     * from a percent field — a green line that visibly falls is worse than
     * either signal on its own.
     */
    tone?: "up" | "down" | "flat";
    className?: string;
    /** Accessible label, e.g. "SOL 24h trend". */
    label?: string;
}

const STROKE = 1.5;

export function CoinSparkline({
    points,
    width = 88,
    height = 28,
    tone,
    className,
    label,
}: CoinSparklineProps) {
    // Mount on approach, not on render.
    //
    // A board page holds 50-100 of these. Building every path up front is work
    // for rows nobody scrolls to, and 200px of margin means the line is already
    // drawn by the time one arrives — so laziness costs nothing visible.
    const ref = useRef<HTMLSpanElement>(null);
    const [seen, setSeen] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || seen) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) setSeen(true);
            },
            { rootMargin: "200px 0px" },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [seen]);

    const direction = tone ?? sparkDirection(points);
    const stroke =
        direction === "up" ? "var(--color-lantern)" : direction === "down" ? "var(--color-pastelred)" : "rgb(113 113 122)";

    const d = seen ? sparkPath(points, width, height, STROKE) : "";
    const empty = points.length < MIN_SPARK_POINTS;

    return (
        <span
            ref={ref}
            className={cn("inline-flex items-center justify-center", className)}
            style={{ width, height }}
            aria-label={label}
            role={label ? "img" : undefined}
        >
            {/* An em-dash, not a flat line: "we have no series" and "this coin
                did not move" are different facts, and a straight stroke would
                assert the second while meaning the first. */}
            {empty ? (
                <span className="text-xs text-zinc-600" aria-hidden>
                    —
                </span>
            ) : (
                <svg
                    width={width}
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    fill="none"
                    // Non-scaling stroke keeps the line 1.5px even when a
                    // container scales the svg, which is what stops it going
                    // hairline-thin in a dense table.
                    vectorEffect="non-scaling-stroke"
                    aria-hidden
                >
                    {d && (
                        <path
                            d={d}
                            stroke={stroke}
                            strokeWidth={STROKE}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}
                </svg>
            )}
        </span>
    );
}
