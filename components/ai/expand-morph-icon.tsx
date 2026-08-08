"use client";

import { useRef } from "react";
import gsap from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(MorphSVGPlugin);

// The panel header's resize control: expand-to-overlay, path-morphing into a
// shrink glyph once you're in the overlay. Third use of the house MorphSVG idiom, after
// components/morph-icons.tsx (player controls) and
// components/marketing/morph-menu-icon.tsx (landing menu) — and structurally
// closest to the menu icon, since both states are plain stroked polylines.
//
// The two corner brackets that read as "expand" simply FLIP to face inward,
// so the control visibly reverses itself rather than swapping to a different
// glyph. Same two paths, same point count, so the morph is exact.

// Collapsed: corners at the OUTER edges, arms opening outward — "expand".
const BRACKET_TL = "M9 4H4V9";
const BRACKET_BR = "M15 20H20V15";

// Expanded: the same two corners flipped to face INWARD — "shrink back down".
// Not an X: an X reads as "close", and this control has never closed anything.
// Pairing it with the panel's own close button made the header look like it had
// two ways to dismiss the same surface. A shrink glyph says what it does.
const SHRINK_TL = "M4 9H9V4";
const SHRINK_BR = "M20 15H15V20";

const DURATION = 0.4;
const EASE = "power3.inOut";

export function ExpandMorphIcon({ expanded, className }: { expanded: boolean; className?: string }) {
    const root = useRef<SVGSVGElement>(null);
    const a = useRef<SVGPathElement>(null);
    const b = useRef<SVGPathElement>(null);

    // Frozen at first render so React keeps rendering the same `d` and leaves
    // the attribute for GSAP to drive — see morph-icons.tsx for why.
    const baseA = useRef(expanded ? SHRINK_TL : BRACKET_TL);
    const baseB = useRef(expanded ? SHRINK_BR : BRACKET_BR);

    useGSAP(
        () => {
            const pathA = a.current;
            const pathB = b.current;
            if (!pathA || !pathB) return;

            // Per docs/design-principles.md, motion is always gated. Reduced
            // motion still gets the state change, just instantly.
            const reduced =
                typeof window !== "undefined" &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const duration = reduced ? 0 : DURATION;

            gsap.to(pathA, {
                morphSVG: expanded ? SHRINK_TL : BRACKET_TL,
                duration,
                ease: EASE,
                overwrite: true,
            });
            gsap.to(pathB, {
                morphSVG: expanded ? SHRINK_BR : BRACKET_BR,
                duration,
                ease: EASE,
                overwrite: true,
            });
        },
        { dependencies: [expanded], scope: root },
    );

    return (
        <svg
            ref={root}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path ref={a} d={baseA.current} />
            <path ref={b} d={baseB.current} />
        </svg>
    );
}
