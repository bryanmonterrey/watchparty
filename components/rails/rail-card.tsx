"use client";

import { useRef } from "react";
import { RailShell } from "./rail-shell";
import { RailScrollbar } from "./rail-scrollbar";
import { cn } from "@/lib/utils";

// The right rail's CARD — extracted from home so the video and live pages can
// be the same thing rather than a lookalike.
//
// They had drifted: home was a bordered squircle with its tabs pinned INSIDE
// the outline, while the video and live rails put loose tabs above an unboxed
// list at a different width (340px vs home's 384px). up-next-sidebar's own
// comment said "the three right rails in the app are meant to read as one
// component in three places" — this is that component.
//
// The tabs go inside the scroller, not above it. That's the whole reason
// RailShell exists: Lisse strokes a whole path with no per-side control, so a
// tab box and a list box that meet draw two hairlines and the seam can't be
// removed from the outside. One squircle with the tabs inside has no internal
// edge to hide.

/** Home's rail width. The one right-rail width in the app — 384px. */
export const RAIL_ASIDE = "hidden w-96 shrink-0 lg:block";

/** Pins to the scroller's top and clears the fixed header with its own padding. */
export const RAIL_INNER = "sticky top-0 flex h-screen flex-col pr-2 md:pt-[calc(var(--header-height)+4px)]";

/** Matches home: the pinned strip's own padding, opaque so rows pass under it. */
const CARD_HEADER_PAD = "px-3 pt-3 pb-2 bg-canvas";

/** Rows carry the horizontal padding, not the scroller — so the pinned tab
 *  strip can reach both edges of the card. */
const CARD_PX = "px-2";

/** Roughly the pinned strip's height; only the scrollbar's top inset reads it. */
const TABS_H = 60;

export function RailCard({
    tabs,
    children,
    /**
     * Whether the card owns the scrolling.
     *
     * true (default) mirrors home: one scroller holding the pinned tabs and the
     * rows. false is for content that scrolls itself — live chat keeps its own
     * scroller and auto-scrolls to the newest message, and nesting that inside
     * another scroller breaks both.
     */
    scroll = true,
}: {
    tabs: React.ReactNode;
    children: React.ReactNode;
    scroll?: boolean;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const pinnedTabs = (
        <div className={cn("sticky top-0 z-20 shrink-0", CARD_HEADER_PAD)}>{tabs}</div>
    );

    if (!scroll) {
        return (
            <RailShell radius={25} bordered>
                <div className="relative flex min-h-0 flex-1 flex-col">
                    {pinnedTabs}
                    <div className={cn("flex min-h-0 flex-1 flex-col", CARD_PX)}>{children}</div>
                </div>
            </RailShell>
        );
    }

    return (
        <RailShell radius={25} bordered>
            {/* relative is the scrollbar's positioning context — it's absolute
                against this, not against the scroller, whose own box scrolls. */}
            <div className="relative flex min-h-0 flex-1 flex-col">
                {/* topPx clears the pinned tabs so the thumb doesn't start behind them. */}
                <RailScrollbar getScroller={() => scrollRef.current} topPx={TABS_H} />
                <div
                    ref={scrollRef}
                    className="hidden-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto"
                >
                    {pinnedTabs}
                    <div className={cn("flex flex-col bg-canvas", CARD_PX)}>{children}</div>
                </div>
            </div>
        </RailShell>
    );
}
