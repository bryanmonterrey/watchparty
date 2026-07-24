import type { CSSProperties } from "react";

// One full sweep of the shimmer highlight band.
const SHIMMER_CYCLE_MS = 1500;

// Self-contained inline style that renders the same shimmer as the
// `.shimmer-skeleton` utility (see globals.css) on ANY element — even a plain
// `bg-*` div — so callers don't need the class. A per-item negative delay
// offsets each sibling's phase, so a row ripples left-to-right instead of
// sweeping in unison. Apply the SAME index to every skeleton within one card so
// the card reads as a single object.
export function staggerPulse(index: number, count: number): CSSProperties {
    return {
        backgroundColor: "color-mix(in oklab, var(--color-soft-gray) 5%, transparent)",
        backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.12) 70%, rgba(255,255,255,0) 100%)",
        backgroundSize: "200% 100%",
        backgroundRepeat: "no-repeat",
        animation: `skeleton-wave ${SHIMMER_CYCLE_MS}ms ease-in-out infinite`,
        animationDelay: `-${count > 0 ? (index * SHIMMER_CYCLE_MS) / count : 0}ms`,
    };
}
