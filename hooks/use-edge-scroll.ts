"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Tracks whether a horizontally scrolling strip can still scroll each way, and
// scrolls it. Shared by the home column's category tabs and the right rail's
// tabs, which need identical behaviour at different sizes — so this owns the
// measuring and each caller renders its own arrows.
export function useEdgeScroll<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T>(null);
    const [canLeft, setCanLeft] = useState(false);
    const [canRight, setCanRight] = useState(false);

    const sync = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // 1px slack — scrollLeft is fractional under zoom / on trackpads, so an
        // exact comparison leaves the end arrow stuck on at the last pixel.
        setCanLeft(el.scrollLeft > 1);
        setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        sync();
        el.addEventListener("scroll", sync, { passive: true });
        // Overflow depends on the container's width, which the page's rails
        // change at their breakpoints — so re-measure on resize too. Observing
        // the strip's children as well catches content changing width without
        // the strip itself resizing.
        const observer = new ResizeObserver(sync);
        observer.observe(el);
        for (const child of Array.from(el.children)) observer.observe(child);
        return () => {
            el.removeEventListener("scroll", sync);
            observer.disconnect();
        };
    }, [sync]);

    const nudge = useCallback((direction: -1 | 1) => {
        const el = ref.current;
        if (!el) return;
        el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.7), behavior: "smooth" });
    }, []);

    return { ref, canLeft, canRight, nudge };
}
