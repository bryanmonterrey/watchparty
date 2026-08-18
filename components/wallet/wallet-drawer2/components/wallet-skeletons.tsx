"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Plain CSS skeletons for the wallet drawer.
 *
 * These intentionally do NOT use boneyard-js: the bones registry
 * (`src/bones/registry.js`) is never imported at runtime (no BonesProvider is
 * mounted) and the drawer's skeleton names were never captured, so boneyard
 * resolved no bones and rendered its empty `fallback` — i.e. blank space. The
 * `.shimmer-skeleton` class (globals.css) is the app-wide loading primitive
 * already used by the header Create / Wallet buttons, so the drawer matches it.
 *
 * House rule: a skeleton wears the REAL component's chrome and blanks only the
 * content slots. So each row below carries the same fill, hairline, radius and
 * padding as the component it stands in for — token rows moved to `bg-panel2` +
 * `border-baseborder/20` in the redesign and these had been left on zinc-900,
 * which is why the list changed color as it loaded.
 */

/**
 * A blanked line of text. The bar is the ink; the wrapper is the LINE BOX, so a
 * skeleton row stands exactly as tall as the row that replaces it. Bars on
 * their own ran ~10px short per row, which is what made the list nudge
 * everything below it when the real rows landed.
 */
function TextBar({
    width,
    bar = "h-4",
    line = "h-6",
}: {
    width: string;
    bar?: string;
    line?: string;
}) {
    return (
        <div className={cn("flex items-center", line)}>
            <div className={cn("rounded-full shimmer-skeleton", bar, width)} />
        </div>
    );
}

// Four rows, because that's TOP_COUNT in wallet-tabs — the coins tab never
// shows more before "All Coins".
export function TokenListSkeleton({ rows = 4 }: { rows?: number }) {
    return (
        <div className="space-y-1">
            {Array.from({ length: rows }).map((_, i) => (
                <div
                    key={i}
                    className="w-full flex items-center justify-between p-3.5 rounded-3xl border border-baseborder/20 bg-panel2"
                >
                    <div className="flex items-center gap-3">
                        {/* TokenIcon size="lg" */}
                        <div className="size-10 shrink-0 rounded-full shimmer-skeleton" />
                        <div className="flex flex-col items-start">
                            {/* 15px symbol over a 13px balance — the two line
                                boxes TokenListItem renders. */}
                            <TextBar width="w-14" bar="h-3.5" line="h-[22px]" />
                            <TextBar width="w-12" bar="h-3" line="h-[19px]" />
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <TextBar width="w-16" bar="h-3.5" line="h-[22px]" />
                        <TextBar width="w-12" bar="h-3" line="h-[19px]" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function NftGridSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="relative aspect-square overflow-hidden rounded-3xl bg-white/[0.03]"
                >
                    <div className="w-full h-full shimmer-skeleton" />
                    {/* The real overlay stays fully rendered — it's chrome, not
                        content, and it's what makes the tile read as a tile. */}
                    <div className="absolute inset-x-2 bottom-2 flex items-center justify-between rounded-2xl bg-black/70 p-2 backdrop-blur-md">
                        <TextBar width="w-20" bar="h-3" line="h-4" />
                        <TextBar width="w-4" bar="h-3" line="h-4" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function TokenSelectorSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <div className="space-y-0.5 px-2">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="w-full flex items-center gap-3.5 p-3 px-4 rounded-2xl">
                    {/* TokenIcon size="md" */}
                    <div className="h-9 w-9 rounded-full shimmer-skeleton shrink-0" />
                    <div className="flex flex-col">
                        <TextBar width="w-28" />
                        <TextBar width="w-12" bar="h-3" line="h-5" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// Mirrors TransactionItem exactly: same p-3.5, same 24px radius, same panel2
// fill and baseborder hairline, same 40px icon and same two-line stack. It was
// the last thing in the drawer still wearing the pre-redesign card (zinc-900 +
// zinc-500/5, 44px icon, p-3), so the activity tab visibly changed surface the
// moment it finished loading — the loudest "old UI" tell in the whole drawer.
function ActivityRowSkeleton() {
    return (
        <div className="w-full rounded-3xl border border-baseborder/20 bg-panel2 p-3.5">
            <div className="flex items-center gap-3">
                <div className="size-10 shrink-0 rounded-full shimmer-skeleton" />
                <div className="flex min-w-0 flex-1 flex-col">
                    {/* 15px bold label / 13px description — the two line boxes
                        TransactionItem renders, so the row is the same height
                        loading as loaded. */}
                    <TextBar width="w-24" bar="h-3.5" line="h-[22px]" />
                    <TextBar width="w-32" bar="h-3" line="h-[19px]" />
                </div>
                <div className="flex shrink-0 flex-col items-end">
                    <TextBar width="w-20" bar="h-3.5" line="h-[22px]" />
                </div>
            </div>
        </div>
    );
}

// Grouped by day, like the real list — a flat run of rows reads as a different
// component and then reflows into groups when it lands. The date heading is a
// 13px line, matching the real one.
export function ActivityListSkeleton() {
    const groups = [2, 2, 2];
    return (
        <div className="space-y-1">
            {groups.map((rows, g) => (
                <div key={g} className="space-y-1 pb-4">
                    <div className="px-1.5">
                        <TextBar width="w-24" bar="h-3" line="h-[19px]" />
                    </div>
                    {Array.from({ length: rows }).map((_, i) => (
                        <ActivityRowSkeleton key={i} />
                    ))}
                </div>
            ))}
        </div>
    );
}
