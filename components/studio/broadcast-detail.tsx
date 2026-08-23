"use client";

import * as React from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

import { trpc } from "@/lib/trpc/client";

// One broadcast, in full — the "Stream Summary drill-down" from the studio
// plan's S5, and the shape X's Live Studio uses: a list of broadcasts where
// each one opens its own page rather than a single global cockpit.
//
// The chart is hand-rolled SVG rather than a charting library: one series, no
// axes to speak of, no zoom, no legend. See ViewerChart for how it was built
// (the dataviz method: form → colour → validated palette → marks → hover).

function fmtClock(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtWhen(d: Date | string): string {
    return new Date(d).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-border/60 bg-card p-4">
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
        </div>
    );
}

/**
 * The viewer curve — one series, per-minute readings.
 *
 * Built against the dataviz method rather than by eye:
 *   · FORM — change-over-time, one measure → line + area fill.
 *   · COLOUR — a single series needs no legend; the title names it. twitter2
 *     (#358efc) validated against this dark card surface (lightness band,
 *     chroma floor, ≥3:1 contrast all pass), so the mark is legible without
 *     leaning on the text beside it.
 *   · MARKS — 2px line, hairline grid one shade off the surface, never dashed
 *     (dashing reads as "projected"), no dot on every point.
 *   · HOVER IS PART OF THE CHART, not an upgrade — the crosshair finds the X so
 *     the reader aims at a TIME rather than at a 2px line, and keyboard focus
 *     gets the same readout as the pointer. Values lead, labels follow.
 *
 * Hand-rolled SVG on purpose: one series, no axes to speak of, no zoom.
 * `lightweight-charts` is in the tree but it is a candlestick engine that
 * mounts a canvas and a time-scale controller — the wrong tool for this.
 */
function ViewerChart({ samples }: { samples: { at: Date | string; viewers: number }[] }) {
    const W = 720;
    const H = 180;
    const PAD = 8;
    const [hover, setHover] = React.useState<number | null>(null);
    const boxRef = React.useRef<HTMLDivElement | null>(null);

    const { line, area, peak, xs, ys } = React.useMemo(() => {
        if (samples.length === 0) return { line: "", area: "", peak: 0, xs: [], ys: [] };
        const peak = Math.max(...samples.map((s) => s.viewers), 1);
        // One sample has no width to spread over; pin it mid-canvas so it draws
        // as a point instead of dividing by zero.
        const stepX = samples.length > 1 ? (W - PAD * 2) / (samples.length - 1) : 0;
        const xs = samples.map((_, i) => (samples.length > 1 ? PAD + i * stepX : W / 2));
        const ys = samples.map((s) => H - PAD - (s.viewers / peak) * (H - PAD * 2));
        const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`);
        return {
            line: `M ${pts.join(" L ")}`,
            area: `M ${PAD},${H - PAD} L ${pts.join(" L ")} L ${W - PAD},${H - PAD} Z`,
            peak,
            xs,
            ys,
        };
    }, [samples]);

    if (samples.length === 0) return null;

    /* Pointer x → nearest sample. The crosshair snaps, so the reader aims at a
       moment in the broadcast and never has to land on the stroke itself. */
    const track = (clientX: number) => {
        const box = boxRef.current?.getBoundingClientRect();
        if (!box || box.width === 0) return;
        const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
        const at = Math.round(((ratio * W - PAD) / (W - PAD * 2)) * (samples.length - 1));
        setHover(Math.min(samples.length - 1, Math.max(0, at)));
    };

    const active = hover === null ? null : samples[hover];
    const hoverTime = active
        ? new Date(active.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : "";

    return (
        <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium">Concurrent viewers</p>
                <p className="text-xs text-muted-foreground">
                    peak <span className="tabular-nums text-foreground">{peak}</span>
                </p>
            </div>

            <div ref={boxRef} className="relative mt-3">
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="h-[180px] w-full touch-none outline-none"
                    preserveAspectRatio="none"
                    role="img"
                    tabIndex={0}
                    aria-label={`Concurrent viewers over the broadcast, peaking at ${peak}`}
                    onPointerMove={(e) => track(e.clientX)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(samples.length - 1)}
                    onBlur={() => setHover(null)}
                    onKeyDown={(e) => {
                        // Keyboard reads the same series the pointer does.
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                            e.preventDefault();
                            setHover((h) => {
                                const at = (h ?? samples.length - 1) + (e.key === "ArrowRight" ? 1 : -1);
                                return Math.min(samples.length - 1, Math.max(0, at));
                            });
                        }
                    }}
                >
                    {/* Hairline grid, solid and one shade off the surface —
                        dashed rules read as projection and add noise. */}
                    {[0.25, 0.5, 0.75].map((f) => (
                        <line
                            key={f}
                            x1={PAD}
                            x2={W - PAD}
                            y1={PAD + f * (H - PAD * 2)}
                            y2={PAD + f * (H - PAD * 2)}
                            className="stroke-border/50"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                    <path d={area} className="fill-twitter2/15" />
                    <path
                        d={line}
                        className="stroke-twitter2"
                        strokeWidth={2}
                        fill="none"
                        vectorEffect="non-scaling-stroke"
                    />
                    {active && hover !== null ? (
                        <>
                            <line
                                x1={xs[hover]}
                                x2={xs[hover]}
                                y1={PAD}
                                y2={H - PAD}
                                className="stroke-border"
                                strokeWidth={1}
                                vectorEffect="non-scaling-stroke"
                            />
                            {/* The surface ring keeps the dot legible where it
                                sits on top of its own fill. */}
                            <circle
                                cx={xs[hover]}
                                cy={ys[hover]}
                                r={4}
                                className="fill-twitter2 stroke-card"
                                strokeWidth={2}
                                vectorEffect="non-scaling-stroke"
                            />
                        </>
                    ) : null}
                </svg>

                {/* Value leads, label follows: the reader already knows the
                    series and wants the number. */}
                {active ? (
                    <div
                        className="pointer-events-none absolute top-0 rounded-lg border border-border/60 bg-popover px-2 py-1 shadow-sm"
                        style={{
                            left: `${(xs[hover!] / W) * 100}%`,
                            transform: `translateX(${xs[hover!] > W / 2 ? "-105%" : "5%"})`,
                        }}
                    >
                        <p className="text-sm font-medium tabular-nums">{active.viewers}</p>
                        <p className="text-11 text-muted-foreground">{hoverTime}</p>
                    </div>
                ) : null}
            </div>

            <div className="mt-2 flex items-center justify-between text-11 text-muted-foreground">
                <span>{new Date(samples[0].at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                <span>One reading a minute</span>
                <span>
                    {new Date(samples[samples.length - 1].at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                    })}
                </span>
            </div>
        </div>
    );
}

export function BroadcastDetail({ id }: { id: string }) {
    const q = trpc.stream.broadcastDetail.useQuery(
        { id },
        // A live broadcast's own page should move; a finished one is a record.
        { refetchInterval: (query) => (query.state.data?.live ? 60_000 : false) },
    );

    if (q.isPending) {
        return (
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
                <div className="h-8 w-48 animate-pulse rounded-lg bg-muted/30" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/30" />
                    ))}
                </div>
                <div className="h-[220px] animate-pulse rounded-2xl bg-muted/30" />
            </div>
        );
    }

    if (q.error) {
        return (
            <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
                <Link href="/studio/content" className="text-xs text-muted-foreground hover:text-foreground">
                    ← Broadcasts
                </Link>
                <p className="mt-4 text-sm text-muted-foreground">{q.error.message}</p>
            </div>
        );
    }

    const b = q.data;

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
                <Link
                    href="/studio/content"
                    aria-label="Back to broadcasts"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                >
                    <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-xl font-semibold">
                        {b.title?.trim() || "Untitled broadcast"}
                    </h1>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {fmtWhen(b.startedAt)}
                        {b.category ? ` · ${b.category}` : ""}
                    </p>
                </div>
                {b.live ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-500">
                        <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                        Live
                    </span>
                ) : (
                    <span className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
                        Ended
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={b.live ? "Live for" : "Duration"} value={fmtClock(b.durationSec)} />
                <Stat label="Peak viewers" value={b.peakViewers === null ? "—" : String(b.peakViewers)} />
                <Stat label="Average viewers" value={b.avgViewers === null ? "—" : String(b.avgViewers)} />
                <Stat label="Readings" value={String(b.sampleCount)} />
            </div>

            <ViewerChart samples={b.samples} />

            {/* Two different silences, and telling them apart is the whole
                value of saying anything: nothing was ever measured, versus the
                minute-by-minute detail has aged out and the totals remain. */}
            {b.samples.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-card p-4">
                    <p className="text-sm font-medium">No viewer curve for this broadcast</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {b.sampleCount > 0
                            ? "Its per-minute readings have aged out — the peak and average above are kept permanently."
                            : "This broadcast ran before the studio started recording viewer counts, so there is nothing to draw."}
                    </p>
                </div>
            ) : null}
        </div>
    );
}
