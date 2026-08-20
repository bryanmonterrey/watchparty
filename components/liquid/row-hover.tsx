"use client";

/* The travelling hover — ONE highlight for a whole list of rows.
   Ported from liquid-taffy, generalized from fixed-pitch rows to arbitrary
   row geometry (y + height), because the app's menus mix row heights,
   headers and separators.

   The hover is not painted on the rows. A single pill lives under them and
   GSAP carries it from row to row, going a little gelatinous on the way: it
   squashes flat as it takes off and rings back to shape on the house spring
   once it lands. Its colour never changes — the surface's own neutral tint —
   and its shape is always the row under the pointer, so "what am I about to
   click" is never ambiguous. */

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { HOUSE_SPRING_POINTS, springEase } from "./springs";
import { prefersReducedMotion } from "./motion";

const SPRING = springEase("liquidRowHoverSpring", HOUSE_SPRING_POINTS);

export interface RowHoverTarget {
    y: number;
    height: number;
}

export function RowHover({
    target,
    inset,
    radius,
}: {
    /* The hovered row's box in the panel's own coordinates, or null for none. */
    target: RowHoverTarget | null;
    /* The panel padding the pill sits inside, exactly where a row does. */
    inset: number;
    radius: number;
}) {
    const pillRef = useRef<HTMLSpanElement>(null);
    /* Where the pill last was. null means it is dark — the next row it takes
       lights up in place instead of flying in from a stale position. */
    const atRef = useRef<RowHoverTarget | null>(null);

    useLayoutEffect(() => {
        const pill = pillRef.current;
        if (!pill) {
            return;
        }

        if (target === null) {
            gsap.killTweensOf(pill);
            gsap.to(pill, { autoAlpha: 0, duration: 0.12, ease: "power1.out" });
            atRef.current = null;
            return;
        }

        const from = atRef.current;
        const same = from !== null && from.y === target.y && from.height === target.height;
        atRef.current = target;
        if (same) {
            return;
        }

        gsap.killTweensOf(pill);

        /* Arriving from nowhere, or reduced motion: the pill is simply where
           it belongs. Nothing travels across a list it was not already on. */
        if (from === null || prefersReducedMotion()) {
            gsap.set(pill, { y: target.y, height: target.height, scaleX: 1, scaleY: 1 });
            gsap.to(pill, { autoAlpha: 1, duration: 0.1, ease: "power1.out" });
            return;
        }

        /* The travel answers the pointer, it does not chase it: an OUT ease
           from the first frame, most of the distance covered in the first
           hundred milliseconds, and the jelly recovery overlapping the tail
           of the ride instead of waiting for it. */
        gsap
            .timeline()
            .to(pill, { y: target.y, height: target.height, duration: 0.19, ease: "power3.out" }, 0)
            /* Flat and a touch wide mid-flight — mass thrown along the travel. */
            .to(pill, { scaleY: 0.82, scaleX: 1.02, duration: 0.08, ease: "power2.out" }, 0)
            .to(pill, { scaleY: 1, scaleX: 1, duration: 0.4, ease: SPRING }, 0.09);
    }, [target]);

    return (
        <span
            ref={pillRef}
            aria-hidden="true"
            style={{
                position: "absolute",
                top: 0,
                left: inset,
                right: inset,
                height: 0,
                zIndex: 0,
                borderRadius: radius,
                background: "rgba(255, 255, 255, 0.045)",
                opacity: 0,
                visibility: "hidden",
                pointerEvents: "none",
                willChange: "transform",
            }}
        />
    );
}
