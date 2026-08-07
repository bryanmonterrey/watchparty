"use client";

import { useRef } from "react";
import gsap from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(MorphSVGPlugin);

// The pink star as an OUTLINE (stroke, no fill), path-morphing into a close X
// when the assistant panel opens — the same MorphSVG technique as the player
// controls (components/morph-icons.tsx) and the landing-page menu
// (components/marketing/morph-menu-icon.tsx), not a scale/fade icon swap.
//
// Two paths, exactly like the menu icon: the star itself collapses into the ╲
// diagonal, and the ╱ diagonal — which has no counterpart in the star, so
// there's nothing for it to morph FROM — scales in from the centre instead.
// Both keep a base `d` frozen in a ref at first render so React never
// re-renders the attribute GSAP is driving and can't clobber the animation
// mid-flight.

// Verbatim from PinkStarLogo (components/icons.tsx:148) / public/pinkstarlogo.svg.
const STAR =
    "M324.642 11.001C355.155 -13.7306 400.907 5.69008 404.312 44.8189L414.088 157.151C415.397 172.193 423.568 185.792 436.235 194.01L530.828 255.378C563.779 276.754 559.447 326.268 523.285 341.598L419.472 385.608C405.57 391.501 395.162 403.475 391.261 418.061L362.127 526.989C351.979 564.932 303.55 576.113 277.796 546.459L203.86 461.326C193.959 449.926 179.356 443.727 164.277 444.524L51.6782 450.477C12.4563 452.551 -13.1427 409.947 7.10175 376.29L65.2201 279.665C73.0027 266.726 74.3854 250.922 68.9679 236.828L28.5111 131.579C14.4187 94.9178 47.0271 57.4062 85.2931 66.2592L195.148 91.6744C209.859 95.0778 225.317 91.509 237.047 82.0013L324.642 11.001Z";

// Diagonals drawn in the star's own 554×564 canvas and centred on its visual
// middle (~277, 282), so the collapse reads as the star folding into the X
// rather than the star vanishing and an X arriving somewhere else.
const CROSS_A = "M183 188L371 376";
const CROSS_B = "M371 188L183 376";

// The source path's control points run slightly outside 0 0 554 564, and a
// stroke adds another half-width on top, so the box is padded rather than
// letting the outline clip flat against the edges.
const VIEW_BOX = "-24 -24 602 612";

// ~2px at the 26px the dock renders this at: 554 units / 26px ≈ 21.3 units per
// px. Round joins so the star's tight inner notches stay clean under a stroke
// this heavy relative to the canvas.
const STROKE = 40;

const DURATION = 0.4;
const EASE = "power3.inOut";

export function StarMorphIcon({
    open,
    className,
    color = "#FCE0CB",
}: {
    open: boolean;
    className?: string;
    color?: string;
}) {
    const root = useRef<SVGSVGElement>(null);
    const star = useRef<SVGPathElement>(null);
    const cross = useRef<SVGPathElement>(null);

    // Frozen at first render — see the note above. Only the star needs this:
    // it's the path whose target changes, so React re-rendering `d` would fight
    // GSAP for the attribute. The second diagonal is always CROSS_B (it moves
    // by transform, not by morph), so it renders the constant directly.
    const baseStar = useRef(open ? CROSS_A : STAR);

    useGSAP(
        () => {
            const s = star.current;
            const c = cross.current;
            if (!s || !c) return;

            // Per docs/design-principles.md, motion is always gated. Reduced
            // motion still gets the state change, just instantly.
            const reduced =
                typeof window !== "undefined" &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const duration = reduced ? 0 : DURATION;

            gsap.to(s, {
                morphSVG: open ? CROSS_A : STAR,
                duration,
                ease: EASE,
                overwrite: true,
            });

            gsap.to(c, {
                opacity: open ? 1 : 0,
                scale: open ? 1 : 0,
                transformOrigin: "50% 50%",
                // Opening, the second diagonal waits for the star to be most of
                // the way collapsed, so you read one shape becoming another
                // instead of two things happening at once. Closing, it gets out
                // of the way immediately so the star has a clean canvas to
                // bloom back into.
                duration: open ? duration : duration * 0.5,
                delay: open ? duration * 0.35 : 0,
                ease: EASE,
                overwrite: true,
            });
        },
        { dependencies: [open], scope: root },
    );

    return (
        <svg
            ref={root}
            viewBox={VIEW_BOX}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path ref={star} d={baseStar.current} />
            <path ref={cross} d={CROSS_B} opacity={0} />
        </svg>
    );
}

// The same outlined star with no morph and no GSAP, for the places that only
// need the mark: the panel header and every assistant message row. Mounting
// the morphing one per message would register a tween per bubble for an icon
// that never changes state.
export function StarOutline({ className, color = "#FCE0CB" }: { className?: string; color?: string }) {
    return (
        <svg
            viewBox={VIEW_BOX}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d={STAR} />
        </svg>
    );
}
