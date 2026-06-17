"use client";

import { useEffect } from "react";

// Forwards wheel events from the side rails to the feed + right rail.
// No custom animation — scroll-behavior: smooth on the containers handles easing.
export function DiscoverScrollForwarder() {
    useEffect(() => {
        const frame = document.getElementById("discover-frame");
        if (!frame) return;

        const onWheel = (e: WheelEvent) => {
            const feed = document.getElementById("discover-feed-scroll");
            if (!feed) return;
            if (feed.contains(e.target as Node)) return;

            e.preventDefault();

            const delta =
                e.deltaMode === 1 ? e.deltaY * 40 :
                e.deltaMode === 2 ? e.deltaY * feed.clientHeight :
                e.deltaY;

            feed.scrollBy({ top: delta });
            document.getElementById("discover-right-rail")?.scrollBy({ top: delta });
        };

        frame.addEventListener("wheel", onWheel, { passive: false });
        return () => frame.removeEventListener("wheel", onWheel);
    }, []);

    return null;
}
