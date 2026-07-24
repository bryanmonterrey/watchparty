"use client";

import { useEffect, useRef } from "react";

// Discover's own scroll-in backdrop. Styles are written directly to the DOM
// via a ref so scroll events never trigger React re-renders (previously useState
// caused ~60 re-renders/sec during the lerp scroll animation).
export function DiscoverScrollBackdrop() {
    const divRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = document.getElementById("app-scroll-container");
        const el = divRef.current;
        if (!container || !el) return;

        const onScroll = () => {
            // Intentionally inert — the discover header stays fully transparent
            // (like the regular header). The feed's own sticky tab bar in
            // browse-feed.tsx carries the light backdrop blur; this backdrop adds
            // no fill or blur of its own so nothing brightens the top strip.
            el.style.backgroundColor = "transparent";
            el.style.backdropFilter = "none";
            (el.style as CSSStyleDeclaration & { webkitBackdropFilter: string }).webkitBackdropFilter = "none";
        };

        onScroll();
        container.addEventListener("scroll", onScroll, { passive: true });
        return () => container.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <div
            ref={divRef}
            aria-hidden
            className="pointer-events-none h-(--header-height) w-full max-md:hidden"
        />
    );
}
