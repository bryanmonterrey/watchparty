"use client";

import { useEffect } from "react";

// Intercepts wheel events on the discover frame and forwards them to the center
// feed column when the pointer is over a side rail. This lets users scroll the
// feed without having to move the mouse over the feed first.
export function DiscoverScrollForwarder() {
    useEffect(() => {
        const frame = document.getElementById("discover-frame");
        if (!frame) return;

        const onWheel = (e: WheelEvent) => {
            const feed = document.getElementById("discover-feed-scroll");
            if (!feed) return;
            // Let native scroll handle it when already over the feed.
            if (feed.contains(e.target as Node)) return;

            e.preventDefault();

            // Scroll the feed and the right rail in sync from anywhere on the frame.
            feed.scrollBy({ top: e.deltaY, left: 0 });
            document.getElementById("discover-right-rail")?.scrollBy({ top: e.deltaY, left: 0 });
        };

        frame.addEventListener("wheel", onWheel, { passive: false });
        return () => frame.removeEventListener("wheel", onWheel);
    }, []);

    return null;
}
