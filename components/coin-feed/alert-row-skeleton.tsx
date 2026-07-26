"use client";

import { staggerPulse } from "@/lib/skeleton-stagger";

// Loading state for the rail. Same shimmer standard as everywhere else
// (.shimmer-skeleton + staggerPulse), so the whole rail pulses as one object
// and lights one row at a time rather than flickering per element.

export const ALERT_SKELETON_COUNT = 7;

export function AlertRowSkeleton({ index, count }: { index: number; count: number }) {
    const pulse = staggerPulse(index, count);
    return (
        <div className="flex items-start gap-2.5 px-2 py-2.5">
            {/* The avatar cluster: three overlapping circles. */}
            <div className="flex shrink-0 -space-x-2">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        style={pulse}
                        className="size-6 rounded-full shimmer-skeleton ring-2 ring-[#080808]"
                    />
                ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                <div className="flex items-center gap-2">
                    <span style={pulse} className="h-3 w-24 rounded-full shimmer-skeleton" />
                    <span style={pulse} className="ml-auto h-3 w-6 rounded-full shimmer-skeleton" />
                </div>
                <div className="flex items-center gap-1.5">
                    <span style={pulse} className="size-4.5 rounded-full shimmer-skeleton" />
                    <span style={pulse} className="h-3 w-2/3 rounded-full shimmer-skeleton" />
                </div>
            </div>
        </div>
    );
}

export function AlertListSkeleton() {
    return (
        <div className="flex flex-col">
            {Array.from({ length: ALERT_SKELETON_COUNT }).map((_, i) => (
                <AlertRowSkeleton key={i} index={i} count={ALERT_SKELETON_COUNT} />
            ))}
        </div>
    );
}
