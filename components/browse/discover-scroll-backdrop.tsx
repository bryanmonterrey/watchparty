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
            const t = Math.min(container.scrollTop / 32, 1);
            // Fully transparent — no canvas fill at all, like the regular header.
            // Just a light scroll-in blur so content reading under the strip is
            // softened without any brightening scrim.
            el.style.backgroundColor = "transparent";
            el.style.backdropFilter = `blur(${t * 10}px)`;
            (el.style as CSSStyleDeclaration & { webkitBackdropFilter: string }).webkitBackdropFilter = `blur(${t * 10}px)`;
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
