"use client";

// The "Chart overlays" row under the chart — which markers the chart shows.
//
// Density is the whole point of these controls. The reference screenshot with
// markers on has bubbles overlapping three deep around the active candles; with
// no filters a busy coin is unreadable. So every control here removes markers,
// and the defaults are the two that keep a chart legible: your own swaps and
// Tags, with the size floor available when even that is too much.

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export interface OverlayState {
    /** Your own trades on this coin. */
    mySwaps: boolean;
    /** Trades carrying a Tag — the written take, formerly "$mentions". */
    tags: boolean;
    /** Only people you follow. */
    friendsOnly: boolean;
    /** Hide anything under this notional. 0 = off. */
    minUsd: number;
}

export const DEFAULT_OVERLAYS: OverlayState = {
    mySwaps: true,
    tags: true,
    friendsOnly: false,
    minUsd: 0,
};

/** The floor the reference offers. One step, not a slider: the useful question
 *  is "hide the dust or not", and a slider invites fiddling for no gain. */
const MIN_SIZE_USD = 1_000;

function Check({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
}) {
    return (
        // t-check + aria-checked drive the transitions.dev checkbox draw
        // (globals.css): the box fills, then the mark strokes in. The icon is
        // always mounted — conditional rendering is what this replaced, and it
        // hard-cuts because the path isn't there to transition from.
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className="t-check flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white"
        >
            <span
                className={cn(
                    "grid size-[18px] place-items-center rounded-full border border-[rgba(138,145,158,0.4)] transition-colors",
                    checked ? "bg-soft-gray/15" : "bg-soft-gray/5",
                )}
            >
                <HugeiconsIcon icon={CheckIcon} className="size-3 text-white" strokeWidth={2.5} aria-hidden />
            </span>
            {/* Own transition-colors: .t-check's transition shorthand lands
                later in the utilities layer and would override it on the
                button itself, so the fade lives on the child instead. */}
            <span className="transition-colors">{label}</span>
        </button>
    );
}

export function ChartOverlayControls({
    value,
    onChange,
    className,
}: {
    value: OverlayState;
    onChange: (v: OverlayState) => void;
    className?: string;
}) {
    const set = <K extends keyof OverlayState>(k: K, v: OverlayState[K]) => onChange({ ...value, [k]: v });

    return (
        <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 px-1.5 py-3", className)}>
            <span className="text-sm font-semibold text-white">Chart overlays</span>
            <span className="hidden h-4 w-px bg-[rgba(138,145,158,0.2)] sm:block" />
            <Check checked={value.mySwaps} onChange={(v) => set("mySwaps", v)} label="My swaps" />
            <Check checked={value.tags} onChange={(v) => set("tags", v)} label="Tags" />
            <Check checked={value.friendsOnly} onChange={(v) => set("friendsOnly", v)} label="Friends only" />
            <button
                type="button"
                onClick={() => set("minUsd", value.minUsd > 0 ? 0 : MIN_SIZE_USD)}
                className={cn(
                    "flex items-center gap-1.5 text-sm font-medium transition-colors",
                    value.minUsd > 0 ? "text-white" : "text-zinc-500 hover:text-zinc-300",
                )}
            >
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
                    <path d="M2 3h12l-4.6 5.4v4.2l-2.8 1.4V8.4L2 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                Min size (&gt;$1K)
            </button>
        </div>
    );
}
