"use client";

import { useSyncExternalStore } from "react";

/**
 * `prefers-reduced-motion: reduce` — the OS accessibility setting
 * (macOS: Accessibility → Display → Reduce motion).
 *
 * Why this exists: the app-wide CSS floor in `globals.css` catches CSS
 * animations, but it cannot touch JS-driven motion — motion/framer-motion
 * rewrite inline styles every frame, so a 1ms transition on those styles
 * changes nothing. Any `motion.*` component that travels needs to ask.
 *
 * Rule of thumb when you do: **opacity may stay, movement goes.** A cross-fade
 * is not what makes people sick; translation, scale, parallax and rotation are.
 * And never freeze a loader — a stopped spinner reads as a hung app. Give it
 * `motion-keep` (see globals.css) or swap the spin for a fade.
 *
 * Note `components/ui/bloom/hooks/useReducedMotion.ts` is a separate vendored
 * copy inside that third-party component. Leave it; new code uses this one.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const list = window.matchMedia(QUERY);
    // `change` on a MediaQueryList fires when the user flips the OS setting
    // mid-session, so a long-lived tab doesn't keep animating at them.
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
}

/** Server render assumes motion is allowed, then corrects on hydration. */
function getServerSnapshot(): boolean {
    return false;
}

/** Live `prefers-reduced-motion`. Re-renders when the OS setting changes. */
export function useReducedMotion(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Picks between two values based on the setting. Keeps the branch out of JSX:
 *
 *   transition={useMotionSafe(SPRING_PANEL, { duration: 0 })}
 *   initial={useMotionSafe({ opacity: 0, y: DISTANCE.arrival }, { opacity: 0 })}
 */
export function useMotionSafe<T>(motion: T, reduced: T): T {
    return useReducedMotion() ? reduced : motion;
}

/**
 * Non-React read, for imperative motion — rAF loops, canvas particle bursts,
 * auto-advancing carousels. Those should either not start, or jump straight to
 * their end state.
 */
export function prefersReducedMotion(): boolean {
    return getSnapshot();
}
