"use client";

import * as React from "react";

/**
 * Plain CSS skeletons for the wallet drawer.
 *
 * These intentionally do NOT use boneyard-js: the bones registry
 * (`src/bones/registry.js`) is never imported at runtime (no BonesProvider is
 * mounted) and the drawer's skeleton names were never captured, so boneyard
 * resolved no bones and rendered its empty `fallback` — i.e. blank space. The
 * `.shimmer-skeleton` class (globals.css) is the app-wide loading primitive
 * already used by the header Create / Wallet buttons, so the drawer matches it.
 */

export function TokenListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-1">
            {Array.from({ length: rows }).map((_, i) => (
                <div
                    key={i}
                    className="w-full flex items-center justify-between p-3.5 rounded-3xl bg-zinc-900 border border-zinc-500/5"
                >
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full shimmer-skeleton shrink-0" />
                        <div className="flex flex-col gap-1.5">
                            <div className="h-3.5 w-16 rounded-full shimmer-skeleton" />
                            <div className="h-3 w-10 rounded-full shimmer-skeleton" />
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <div className="h-3.5 w-14 rounded-full shimmer-skeleton" />
                        <div className="h-3 w-10 rounded-full shimmer-skeleton" />
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
                    className="aspect-square rounded-xl overflow-hidden bg-zinc-900/40 relative"
                >
                    <div className="w-full h-full shimmer-skeleton" />
                    <div className="absolute inset-x-2 bottom-2 p-2 bg-black/90 backdrop-blur-md rounded-md border border-white/5 flex items-center justify-between">
                        <div className="h-3 w-20 rounded-full shimmer-skeleton" />
                        <div className="h-3 w-4 rounded-full shimmer-skeleton" />
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
                <div
                    key={i}
                    className="w-full flex items-center gap-3.5 p-3 px-4 rounded-2xl"
                >
                    <div className="h-10 w-10 rounded-full shimmer-skeleton shrink-0" />
                    <div className="flex flex-col gap-1.5">
                        <div className="h-3.5 w-28 rounded-full shimmer-skeleton" />
                        <div className="h-3 w-12 rounded-full shimmer-skeleton" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function ActivityRowSkeleton() {
    return (
        <div className="w-full flex items-center justify-between p-3 rounded-3xl bg-zinc-900 border border-zinc-500/5 gap-4">
            <div className="h-11 w-11 rounded-full shimmer-skeleton shrink-0" />
            <div className="flex flex-col flex-1 min-w-0 gap-1.5">
                <div className="h-4 w-20 rounded-full shimmer-skeleton" />
                <div className="h-3 w-28 rounded-full shimmer-skeleton" />
            </div>
            <div className="h-4 w-16 rounded-full shimmer-skeleton shrink-0" />
        </div>
    );
}

export function ActivityListSkeleton() {
    const groups = [
        { label: "Today", rows: 2 },
        { label: "Yesterday", rows: 2 },
        { label: "Earlier", rows: 2 },
    ];
    return (
        <div className="space-y-1">
            {groups.map((group) => (
                <div key={group.label} className="space-y-1 pb-4">
                    <div className="px-1 py-1">
                        <div className="h-3.5 w-24 rounded-full shimmer-skeleton" />
                    </div>
                    {Array.from({ length: group.rows }).map((_, i) => (
                        <ActivityRowSkeleton key={i} />
                    ))}
                </div>
            ))}
        </div>
    );
}
