"use client";

import * as React from "react";

/**
 * Measures an element's own width, the CSS-container-query way rather than the
 * viewport way.
 *
 * A board that renders inside a narrow centre column must not decide its
 * columns from `window.innerWidth` — that measures width the component doesn't
 * own, and reveals columns that then overflow. This is the JS equivalent of
 * `@container`: it answers "how wide am *I*", so the same component stays
 * correct wherever it is mounted.
 *
 * Returns 0 until the first measurement, which reads as the narrowest
 * breakpoint — the mobile-first default.
 */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
    const ref = React.useRef<T>(null);
    const [width, setWidth] = React.useState(0);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) setWidth(entry.contentRect.width);
        });
        observer.observe(el);
        setWidth(el.getBoundingClientRect().width);
        return () => observer.disconnect();
    }, []);

    return [ref, width];
}
