import type { CSSProperties, ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp01Icon, GripVerticalIcon, PercentIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/** One header cell as DataTable draws it: the reorder grip, then the label
 *  and its sort caret at 35% — the resting opacity of an unsorted column. */
function ShellHeader({
    label,
    className,
    style,
    align,
    sortable,
}: {
    label: ReactNode;
    className?: string;
    style?: CSSProperties;
    align?: "right";
    sortable?: boolean;
}) {
    return (
        <div className={cn("flex shrink-0 items-center", className)} style={style}>
            <span className="flex w-5 shrink-0 items-center justify-center text-zinc-600">
                <HugeiconsIcon icon={GripVerticalIcon} className="size-3.5" strokeWidth={2} />
            </span>
            <span className={cn("flex min-w-0 flex-1 items-center gap-1 px-4", align === "right" && "justify-end")}>
                <span className="truncate">{label}</span>
                {sortable && (
                    <span className="inline-flex shrink-0 opacity-35">
                        <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" strokeWidth={2.5} />
                    </span>
                )}
            </span>
        </div>
    );
}

// The instant shell for /trade — mirrors the discover board's own first
// frame (see home/loading.tsx for the standard: every box is what the
// mounted page paints WHILE ITS QUERIES LOAD, never a generic skeleton).
//
//   · tabs — trade-discover renders its real pill labels immediately
//     (data-independent): Trending active on the sidebar-hover pill, the
//     rest zinc-400. Same classes, just not clickable yet.
//   · controls — the timeframe pills and chain select stand in as blanks
//     at their real sizes.
//   · board — column labels (Coin / Market cap / Price / % / trend /
//     Action)
//     over rows of the table's anatomy: coin avatar, ticker/name bars,
//     right-aligned value bars, and the buy group's pill footprint.
export default function TradeLoading() {
    return (
        <div className="h-full w-full" aria-hidden>
            {/* The control bar, mirrored WHOLE — its sticky wrapper, its glass
                fill, its header spacer (hidden below md) and its tab row at
                the real padding. Reproducing only the two inner boxes let the
                tabs ride up over the app header, because the wrapper is what
                holds them under it. */}
            <div className="sticky top-0 z-40">
                <div className="pointer-events-none absolute inset-0 -z-10 bg-canvas backdrop-blur-sm" />
                <div className="h-(--header-height) max-md:hidden" />
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-2 lg:px-6">
                    <div className="flex items-center gap-1">
                        <span className="flex items-center rounded-full bg-sidebar-hover px-4 py-2 text-lg font-bold tracking-tight text-flexwhite">Trending</span>
                        {["Surge", "Live", "Top", "New"].map((label) => (
                            <span key={label} className="flex items-center rounded-full px-4 py-2 text-lg font-bold tracking-tight text-zinc-400">{label}</span>
                        ))}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-36 rounded-full shimmer-skeleton" />
                        <div className="h-11 w-32 rounded-full shimmer-skeleton" />
                    </div>
                </div>
            </div>

            {/* The header, mirrored STRUCTURALLY rather than approximated: the
                real one is [grip][label + sort caret] per column at the
                DataTable's own widths, and a row of plain right-aligned words
                at fixed widths landed the labels nowhere near them (owner:
                "the column labels of the first loading state do not match
                normal ones at all"). Percentages here are the same ones
                trade-columns declares — 13% each for the three value columns,
                116px for the trend, 232px for the action group. */}
            <div className="flex items-center px-2 text-15 font-medium leading-tight text-zinc-500">
                <ShellHeader label="Coin" className="flex-1" />
                <ShellHeader label="Market cap" style={{ width: "13%" }} align="right" sortable />
                <ShellHeader label="Price" style={{ width: "13%" }} align="right" sortable />
                <ShellHeader
                    label={<HugeiconsIcon icon={PercentIcon} className="size-4" strokeWidth={2.5} />}
                    style={{ width: "13%" }}
                    align="right"
                    sortable
                />
                {/* Trend: no label, no grip — see meta.noReorder. */}
                <span className="w-[116px] shrink-0" />
                <ShellHeader label="Action" style={{ width: "232px" }} align="right" />
            </div>
            {Array.from({ length: 10 }).map((_, index) => (
                /* Box for box with the MOUNTED board's skeleton (the
                   per-column meta.skeleton in trade-columns): size-12 avatar,
                   two h-3 lines, right-aligned h-3 bars, the buy group's own
                   pill. The two loading states used to differ in line height
                   and shape, which read as the page loading twice. */
                <div key={index} className="flex h-[76px] items-center px-2">
                    <div className="flex flex-1 items-center gap-3 px-4">
                        <div className="size-12 shrink-0 rounded-full shimmer-skeleton" />
                        <div className="flex flex-col gap-1.5">
                            <div className="h-3 w-28 rounded-full shimmer-skeleton" />
                            <div className="h-3 w-16 rounded-full shimmer-skeleton" />
                        </div>
                    </div>
                    <div className="flex justify-end px-4" style={{ width: "13%" }}><div className="h-3 w-16 rounded-full shimmer-skeleton" /></div>
                    <div className="flex justify-end px-4" style={{ width: "13%" }}><div className="h-3 w-16 rounded-full shimmer-skeleton" /></div>
                    <div className="flex justify-end px-4" style={{ width: "13%" }}><div className="h-3 w-12 rounded-full shimmer-skeleton" /></div>
                    <div className="flex w-[116px] shrink-0 items-center px-4"><div className="h-7 w-24 rounded-full shimmer-skeleton" /></div>
                    <div className="flex w-[232px] shrink-0 justify-end px-4"><div className="h-11 w-[185px] rounded-2xl shimmer-skeleton" /></div>
                </div>
            ))}
        </div>
    );
}
