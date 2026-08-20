/* The one motion question every liquid component asks: may I move at all?
   ONE implementation for the family (ported from liquid-taffy). */

export function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
