"use client";

import { useRef } from "react";

/**
 * Hover-intent prefetch: returns mouse/focus handlers that invoke `prefetch`
 * after the pointer has rested on the element for `delayMs` (canceled if it
 * leaves sooner), and at most once per component instance. The delay keeps
 * scroll-past over long lists (feed cards, token rows) from firing a request
 * per row; the once-guard makes repeat hovers free without relying on the
 * caller's cache semantics.
 */
export function useHoverPrefetch(prefetch: () => void, delayMs = 120) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fired = useRef(false);

    const cancel = () => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
    };

    const start = () => {
        if (fired.current || timer.current) return;
        timer.current = setTimeout(() => {
            timer.current = null;
            fired.current = true;
            prefetch();
        }, delayMs);
    };

    return { onMouseEnter: start, onMouseLeave: cancel, onFocus: start, onBlur: cancel };
}
