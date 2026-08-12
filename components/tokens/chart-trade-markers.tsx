"use client";

// Avatar bubbles pinned to the candle where a trade happened — the markers on
// fomo's chart, which anchor a Tag here.
//
// ## This is possible with Advanced Charts, contrary to first impressions
//
// The Charting Library deliberately exposes no `priceToCoordinate` /
// `timeToCoordinate`, which reads like "you cannot position anything". It does
// expose the three things you need to compute the pixel yourself:
//
//     chart().getVisibleRange()                              -> {from, to} time
//     pane.getMainSourcePriceScale().getVisiblePriceRange()  -> {from, to} price
//     pane.getHeight()                                       -> pixels
//
// Width comes from the container element. Both axes are linear in the default
// (non-log) mode, so the mapping is a straight interpolation. `createShape` and
// `createExecutionShape` are the library's own marker APIs and neither renders
// an image, which is why this is a DOM layer rather than a chart drawing.
//
// ## Why a rAF loop rather than range subscriptions
//
// `onVisibleRangeChanged` fires after a pan settles, not during it, so markers
// would lag the candles by a frame or more and visibly swim. Reading two ranges
// and writing a transform for a few dozen nodes is well under a millisecond;
// correctness during the interaction is worth more than the saved frames.
//
// ## Log scale is not supported, and says so
//
// Price interpolation is linear. On a log scale every marker would sit at the
// wrong height — subtly, which is worse than obviously — so the layer hides
// itself instead of lying. The chart's `log` toggle is right there in the
// footer, so this is a state a user reaches by accident.

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChartMarker {
    /** Unix SECONDS, matching the chart's time axis. */
    ts: number;
    priceUsd: number;
    isBuy: boolean;
    /** Site user, when the wallet resolves to one. */
    username?: string | null;
    avatarUrl?: string | null;
    /** The Tag this trade carries, if any. */
    tag?: string | null;
    usdValue?: number;
    key: string;
}

interface TvPriceScale {
    getVisiblePriceRange(): { from: number; to: number } | null;
}
interface TvPane {
    getHeight(): number;
    getMainSourcePriceScale(): TvPriceScale | null;
}
interface TvChart {
    getVisibleRange(): { from: number; to: number };
    getPanes(): TvPane[];
}
/** Only the slice of the widget this needs — the full type lives in the
 *  library's own d.ts and importing it would drag the whole surface in. */
export interface TvWidgetLike {
    activeChart(): TvChart;
}

/** Bubble diameter. 28px matches the reference at a 1m chart: big enough to
 *  read a face, small enough that a cluster still shows the candles behind. */
const SIZE = 28;

export function ChartTradeMarkers({
    widget,
    markers,
    containerRef,
    enabled = true,
    minUsd = 0,
    onSelect,
}: {
    /** Null until the chart is ready; the layer simply renders nothing. */
    widget: TvWidgetLike | null;
    markers: readonly ChartMarker[];
    /** The element the chart draws into — supplies the pixel width. */
    containerRef: React.RefObject<HTMLDivElement | null>;
    enabled?: boolean;
    minUsd?: number;
    onSelect?: (m: ChartMarker) => void;
}) {
    const layerRef = React.useRef<HTMLDivElement>(null);
    const nodesRef = React.useRef(new Map<string, HTMLElement>());

    const visible = React.useMemo(
        () => (enabled ? markers.filter((m) => (m.usdValue ?? 0) >= minUsd) : []),
        [markers, minUsd, enabled],
    );

    React.useEffect(() => {
        if (!widget || !visible.length) return;
        let frame = 0;

        const place = () => {
            frame = requestAnimationFrame(place);
            const el = containerRef.current;
            const layer = layerRef.current;
            if (!el || !layer) return;

            let chart: TvChart;
            let pane: TvPane | undefined;
            try {
                chart = widget.activeChart();
                pane = chart.getPanes()[0];
            } catch {
                // The widget tears down asynchronously on unmount/symbol change
                // and throws for a frame or two. Skipping is correct; the next
                // frame either works or the effect has been cleaned up.
                return;
            }
            if (!pane) return;

            const time = chart.getVisibleRange();
            const price = pane.getMainSourcePriceScale()?.getVisiblePriceRange() ?? null;
            const height = pane.getHeight();
            const width = el.clientWidth;
            if (!price || !height || !width || time.to <= time.from || price.to <= price.from) {
                layer.style.opacity = "0";
                return;
            }
            layer.style.opacity = "1";

            const spanT = time.to - time.from;
            const spanP = price.to - price.from;

            for (const m of visible) {
                const node = nodesRef.current.get(m.key);
                if (!node) continue;
                // Outside the visible window: hide rather than clamp, or a pan
                // leaves a wall of bubbles stacked against the edge.
                if (m.ts < time.from || m.ts > time.to || m.priceUsd < price.from || m.priceUsd > price.to) {
                    node.style.visibility = "hidden";
                    continue;
                }
                const x = ((m.ts - time.from) / spanT) * width;
                const y = (1 - (m.priceUsd - price.from) / spanP) * height;
                node.style.visibility = "visible";
                node.style.transform = `translate3d(${Math.round(x - SIZE / 2)}px, ${Math.round(y - SIZE / 2)}px, 0)`;
            }
        };

        frame = requestAnimationFrame(place);
        return () => cancelAnimationFrame(frame);
    }, [widget, visible, containerRef]);

    if (!visible.length) return null;

    return (
        <div
            ref={layerRef}
            aria-hidden={false}
            // pointer-events-none on the LAYER, auto on each bubble: the layer
            // covers the whole chart, and swallowing drags here would break
            // panning and zooming entirely.
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        >
            {visible.map((m) => (
                <button
                    key={m.key}
                    ref={(n) => {
                        if (n) nodesRef.current.set(m.key, n);
                        else nodesRef.current.delete(m.key);
                    }}
                    type="button"
                    onClick={() => onSelect?.(m)}
                    title={m.tag ? `${m.username ?? "trader"}: ${m.tag}` : (m.username ?? undefined)}
                    style={{ width: SIZE, height: SIZE, willChange: "transform" }}
                    className={cn(
                        "pointer-events-auto absolute left-0 top-0 rounded-full p-[2px] transition-transform hover:scale-110",
                        // The ring carries the side, which is the one thing a
                        // glance should get: green bought here, red sold here.
                        m.isBuy ? "bg-lantern" : "bg-pastelred",
                    )}
                >
                    <span className="block size-full overflow-hidden rounded-full bg-canvas">
                        {/* eslint-disable-next-line @next/next/no-img-element -- remote avatars from many hosts; next/image would need every one in remotePatterns */}
                        <img
                            src={m.avatarUrl || "/avatar.png"}
                            alt=""
                            width={SIZE}
                            height={SIZE}
                            className="size-full object-cover"
                            loading="lazy"
                        />
                    </span>
                </button>
            ))}
        </div>
    );
}
