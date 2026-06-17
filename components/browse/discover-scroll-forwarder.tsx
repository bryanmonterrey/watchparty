"use client";

import { useEffect } from "react";

// Forwards wheel events from the side rails to the feed + right rail.
// Synchronous scrollTop assignment — identical to native wheel scrolling.
// No RAF, no scroll-behavior:smooth (which fought the per-frame writes and
// stalled the feed), no accumulated target. Whatever delta the OS sends, we
// apply instantly, exactly like the browser does when hovering the feed.
export function DiscoverScrollForwarder() {
    useEffect(() => {
        const frame = document.getElementById("discover-frame");
        if (!frame) return;

        const onWheel = (e: WheelEvent) => {
            const feed = document.getElementById("discover-feed-scroll");
            if (!feed) return;
            // Hovering the feed → leave it fully native.
            if (feed.contains(e.target as Node)) {
                const before = feed.scrollTop;
                // Measure native applied movement on the next frame.
                requestAnimationFrame(() => {
                    const moved = feed.scrollTop - before;
                    console.log("[scroll] FEED native", { deltaY: e.deltaY, applied: moved.toFixed(1) });
                });
                return;
            }

            e.preventDefault();

            const delta =
                e.deltaMode === 1 ? e.deltaY * 40 :
                e.deltaMode === 2 ? e.deltaY * feed.clientHeight :
                e.deltaY;

            const before = feed.scrollTop;
            feed.scrollTop += delta;
            const moved = feed.scrollTop - before;
            const rail = document.getElementById("discover-right-rail");
            if (rail) rail.scrollTop += delta;

            // applied should equal delta (minus clamp at top/bottom) — i.e. no stalling.
            console.log("[scroll] RAIL forwarded", {
                deltaY: e.deltaY.toFixed(1),
                delta: delta.toFixed(1),
                applied: moved.toFixed(1),
                stalled: Math.abs(moved - delta) > 1 && before > 0 && feed.scrollTop < feed.scrollHeight - feed.clientHeight,
            });
        };

        frame.addEventListener("wheel", onWheel, { passive: false });
        return () => frame.removeEventListener("wheel", onWheel);
    }, []);

    return null;
}
