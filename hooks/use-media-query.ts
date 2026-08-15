"use client";

import * as React from "react";

/**
 * Subscribes to a CSS media query. `useSyncExternalStore` rather than
 * `useEffect` so the value is read during the same commit the subscription is
 * set up in — no extra render, and no window of a stale answer.
 *
 * The server snapshot is `false`, which keeps the mobile-first rule honest:
 * whatever a `(min-width: …)` query unlocks is treated as absent until the
 * client proves otherwise.
 */
export function useMediaQuery(query: string): boolean {
    const subscribe = React.useCallback(
        (onChange: () => void) => {
            const mql = window.matchMedia(query);
            mql.addEventListener("change", onChange);
            return () => mql.removeEventListener("change", onChange);
        },
        [query],
    );

    return React.useSyncExternalStore(
        subscribe,
        () => window.matchMedia(query).matches,
        () => false,
    );
}
