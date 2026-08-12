"use client";

// The market-cap / price / change / volume / liquidity strip in the coin header.
//
// Two things it has to do that a plain `overflow-x-auto` does not:
//
//   FADE AT THE EDGES so a cut-off tile reads as "there is more this way"
//   rather than as a clipping bug. bg-canvas -> transparent on the left,
//   transparent -> bg-canvas on the right, and each side only appears when
//   there is actually something hidden behind it — a permanent fade on a strip
//   that already fits looks like a rendering artefact.
//
//   DRAG TO SCROLL, because this is a horizontal strip inside a page that
//   scrolls vertically. On a trackpad a horizontal wheel works; with a mouse
//   there is no gesture at all, so the tiles past the fold are unreachable
//   without a scrollbar we hide app-wide (globals.css `scrollbar-width: none`).
//
// Pointer events, not mouse events: the same handlers then cover touch and pen,
// and `setPointerCapture` keeps the drag alive when the cursor leaves the strip
// mid-gesture, which is most of them.

import * as React from "react";
import { cn } from "@/lib/utils";

export function StatCarousel({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const ref = React.useRef<HTMLDivElement>(null);
    const [edges, setEdges] = React.useState({ left: false, right: false });
    const drag = React.useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);

    const measure = React.useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const max = el.scrollWidth - el.clientWidth;
        // 1px of slack: sub-pixel layout leaves scrollLeft at 0.4 on a strip
        // that is visually flush, which would flicker the fade on and off.
        setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
    }, []);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        // Children changing width (a number growing a digit) moves the max
        // scroll without firing a scroll event.
        for (const child of Array.from(el.children)) ro.observe(child);
        return () => ro.disconnect();
    }, [measure, children]);

    return (
        <div className={cn("relative min-w-0", className)}>
            <div
                ref={ref}
                onScroll={measure}
                onPointerDown={(e) => {
                    // Ignore anything but the primary button, and let a real
                    // control inside the strip keep its own click.
                    if (e.button !== 0) return;
                    const el = ref.current;
                    if (!el) return;
                    drag.current = { startX: e.clientX, startScroll: el.scrollLeft, moved: false };
                    el.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                    const el = ref.current;
                    const d = drag.current;
                    if (!el || !d) return;
                    const dx = e.clientX - d.startX;
                    // A few pixels of slop before it counts as a drag, so a
                    // slightly shaky click on a tile is still a click.
                    if (!d.moved && Math.abs(dx) < 4) return;
                    d.moved = true;
                    el.scrollLeft = d.startScroll - dx;
                }}
                onPointerUp={(e) => {
                    ref.current?.releasePointerCapture(e.pointerId);
                    drag.current = null;
                }}
                onPointerCancel={() => {
                    drag.current = null;
                }}
                className={cn(
                    // NO negative margin. `-mx-1 px-1` made the scroller 8px
                    // WIDER than the wrapper the fades are positioned against,
                    // so a tile's edge sat 4px outside the gradient on each side
                    // and showed through as a hard sliver — the fade looked
                    // px-1-ish because that was the only part of the tile it was
                    // actually covering. The scroller has to share its edges with
                    // the element the fades are pinned to.
                    "hidden-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto py-0.5",
                    "cursor-grab select-none active:cursor-grabbing",
                    // The strip owns horizontal panning; the page keeps vertical.
                    "touch-pan-x",
                )}
            >
                {children}
            </div>

            {/* Fades are siblings, not children of the scroller — inside it they
                would scroll away with the content. pointer-events-none so they
                never eat a drag that starts on the fade itself. */}
            <div
                aria-hidden
                className={cn(
                    "pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-canvas to-transparent transition-opacity duration-200",
                    edges.left ? "opacity-100" : "opacity-0",
                )}
            />
            <div
                aria-hidden
                className={cn(
                    "pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-canvas to-transparent transition-opacity duration-200",
                    edges.right ? "opacity-100" : "opacity-0",
                )}
            />
        </div>
    );
}
