import type { CSSProperties } from "react";

// Total time for the brightness spike to travel across the whole row once.
const STAGGER_CYCLE_MS = 2000;

// Inline style for a skeleton element so the row pulses one item at a time
// (left to right). Spacing each item's delay by cycle/count means only one
// item's narrow spike (see the `stagger-pulse` keyframe in globals.css) is lit
// at any moment. Apply the SAME index to every skeleton within one card so the
// whole card pulses as a single object. Overrides the Skeleton's `animate-pulse`
// (inline animation beats the class).
export function staggerPulse(index: number, count: number): CSSProperties {
    return {
        animation: `stagger-pulse ${STAGGER_CYCLE_MS}ms linear infinite`,
        animationDelay: `${count > 0 ? (index * STAGGER_CYCLE_MS) / count : 0}ms`,
    };
}
