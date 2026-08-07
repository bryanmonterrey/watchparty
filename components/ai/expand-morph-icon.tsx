"use client";

import { useRef } from "react";
import gsap from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(MorphSVGPlugin);

// The panel header's resize control: expand-to-overlay, path-morphing into an X
// once you're in the overlay. Third use of the house MorphSVG idiom, after
// components/morph-icons.tsx (player controls) and
// components/marketing/morph-menu-icon.tsx (landing menu) — and structurally
// closest to the menu icon, since both states are plain stroked polylines.
//
// The two corner brackets that read as "expand" ARE the X's two diagonals:
// each bracket unfolds from an L into a straight line rather than
// cross-fading, so the control visibly reverses itself instead of swapping to
// a different glyph.

// Opposite corners of the standard expand-diagonal glyph.
const BRACKET_TL = "M9 4H4V9";
const BRACKET_BR = "M15 20H20V15";

// ╲ and ╱. Same start corner as the bracket each one takes over from, so the
// top-left bracket straightens along the diagonal it already pointed down.
const DIAGONAL_A = "M6 6L18 18";
const DIAGONAL_B = "M18 6L6 18";

const DURATION = 0.4;
const EASE = "power3.inOut";

export function ExpandMorphIcon({ expanded, className }: { expanded: boolean; className?: string }) {
    const root = useRef<SVGSVGElement>(null);
    const a = useRef<SVGPathElement>(null);
    const b = useRef<SVGPathElement>(null);

    // Frozen at first render so React keeps rendering the same `d` and leaves
    // the attribute for GSAP to drive — see morph-icons.tsx for why.
    const baseA = useRef(expanded ? DIAGONAL_A : BRACKET_TL);
    const baseB = useRef(expanded ? DIAGONAL_B : BRACKET_BR);

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
                morphSVG: expanded ? DIAGONAL_A : BRACKET_TL,
                duration,
                ease: EASE,
                overwrite: true,
            });
            gsap.to(pathB, {
                morphSVG: expanded ? DIAGONAL_B : BRACKET_BR,
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
