"use client";

import { useEffect, useState } from "react";

// Discover's own scroll-in backdrop. Mimics the global AppHeader backdrop div,
// but lives INSIDE the discover layout so it sits in the same stacking context
// as the columns: beneath the global header (and beneath the feed, z-100), it
// darkens/blurs the side columns on scroll without ever obstructing the feed.
// The global header's own backdrop is disabled on /discover so they don't
// double up.
//
// The caller wraps this in a `sticky top-0 z-40 h-0` div so it overlays the top
// strip without pushing the columns down.
export function DiscoverScrollBackdrop() {
    const [scrollY, setScrollY] = useState(0);

    useEffect(() => {
        const container = document.getElementById("app-scroll-container");
        if (!container) return;
        const onScroll = () => setScrollY(container.scrollTop);
        onScroll();
        container.addEventListener("scroll", onScroll, { passive: true });
        return () => container.removeEventListener("scroll", onScroll);
    }, []);

    const t = Math.min(scrollY / 32, 1);

    return (
        <div
            aria-hidden
            className="pointer-events-none h-(--header-height) w-full transition-colors max-md:hidden"
            style={{
                backgroundColor: `rgba(0,0,0,${t * 0.2})`,
                backdropFilter: `blur(${t * 24}px)`,
                WebkitBackdropFilter: `blur(${t * 24}px)`,
            }}
        />
    );
}
