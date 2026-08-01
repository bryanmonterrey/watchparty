"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True once a `position: sticky` element has actually stuck to its offset.
 *
 * Put the returned ref on a zero-height sentinel rendered immediately BEFORE
 * the sticky element. The sentinel scrolls normally, so the moment it passes
 * the sticky element's own `top` line the element has stuck — which is exactly
 * the moment content starts moving behind it.
 *
 * That's what this is for: a sticky bar only needs an opaque fill while it's
 * stuck. Unstuck it can be transparent, and on home that lets the hero's
 * ambient glow paint through the category tabs and the board's column labels
 * instead of hitting a flat edge.
 *
 * The offset is read off the sticky element's own computed `top` rather than
 * passed in, so a value like `var(--header-height)` — which differs per
 * breakpoint — resolves to real pixels here instead of being duplicated as a
 * magic number at every call site.
 */
export function useStuck<T extends HTMLElement = HTMLDivElement>() {
    const sentinelRef = useRef<T>(null);
    const [stuck, setStuck] = useState(false);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        const sticky = sentinel?.nextElementSibling;
        if (!sentinel || !sticky) return;

        // The page scrolls inside the app container, not the window, so a
        // viewport-rooted observer would never see the sentinel move.
        const root = document.getElementById("app-scroll-container");

        let observer: IntersectionObserver | undefined;

        // Re-read on resize: --header-height is breakpoint-dependent, and the
        // rootMargin is a fixed pixel string once the observer is constructed.
        const attach = () => {
            observer?.disconnect();
            const top = Number.parseFloat(getComputedStyle(sticky).top) || 0;
            observer = new IntersectionObserver(
                ([entry]) => setStuck(!entry.isIntersecting),
                { root, rootMargin: `-${top + 1}px 0px 0px 0px`, threshold: 0 },
            );
            observer.observe(sentinel);
        };

        attach();
        window.addEventListener("resize", attach);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", attach);
        };
    }, []);

    return { sentinelRef, stuck };
}
