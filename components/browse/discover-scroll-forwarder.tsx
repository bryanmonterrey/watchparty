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
            if (feed.contains(e.target as Node)) return;

            e.preventDefault();

            const delta =
                e.deltaMode === 1 ? e.deltaY * 40 :
                e.deltaMode === 2 ? e.deltaY * feed.clientHeight :
                e.deltaY;

            feed.scrollTop += delta;
            const rail = document.getElementById("discover-right-rail");
            if (rail) rail.scrollTop += delta;
        };

        frame.addEventListener("wheel", onWheel, { passive: false });
        return () => frame.removeEventListener("wheel", onWheel);
    }, []);

    return null;
}
