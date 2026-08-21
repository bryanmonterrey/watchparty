"use client";

/* Layer 1 of the liquid popover: the RESTING panel — the picture the goo hands
   back to. Three nested boxes, and which paint sits on which is load-bearing:

     bodies   bare wrapper. No `isolate`, no opacity, no filter — each of those
              is a BACKDROP ROOT, and the glass below would then have an empty
              group to blur (it renders nothing, silently).
     panelBody  the box gsap TRANSFORMS and geometry positions. Carries no
              paint: a transformed ancestor holding the blur would resample the
              backdrop every frame of the pour.
     panelGlass  the face — the fill at SURFACE_ALPHA over the backdrop blur,
              cut to the squircle by a clip-path geometry writes. `isolate` is
              safe HERE, and needed, because it bounds the grain's `overlay`
              blend to this face: a backdrop root governs its DESCENDANTS,
              never the element's own blur.
     panelRim  the border, as a real stroke, OUTSIDE the glass — a clip-path
              would shave the outer half of a 1px line off a child.

   Split out of liquid-popover.tsx when that file crossed the 1000-line guard
   (scripts/guards/check-file-sizes.mjs). It is the only piece of that render
   that is pure markup: everything is written imperatively afterwards, so this
   component takes the refs bag and the fill and nothing else. */

import { BACKDROP_BLUR, RIM_ALPHA, RIM_PAINT, glassFill } from "./liquid-theme";
import type { LiquidRefs } from "./liquid-refs";

export function LiquidPanelBody({ refs, fill }: { refs: LiquidRefs; fill: string }) {
    return (
        <div
            ref={(el) => {
                refs.bodies = el;
            }}
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
        >
            <div
                ref={(el) => {
                    refs.panelBody = el;
                }}
                className="absolute will-change-transform"
                /* Hidden in the MARKUP too — the SSR HTML must arrive invisible
                   or every menu flashes open, unstyled, for the beat before
                   hydration (no border, transparent bg: the "rough" first
                   paint). gsap's autoAlpha writes these same two properties
                   from the mount effect on. */
                style={{ opacity: 0, visibility: "hidden" }}
            >
                <div
                    ref={(el) => {
                        refs.panelGlass = el;
                    }}
                    className="absolute inset-0 isolate"
                    style={{
                        backgroundColor: glassFill(fill),
                        backdropFilter: BACKDROP_BLUR,
                        WebkitBackdropFilter: BACKDROP_BLUR,
                    }}
                >
                    <div className="grain-layer" />
                </div>

                <svg
                    ref={(el) => {
                        refs.panelRim = el;
                    }}
                    className="absolute inset-0 overflow-visible"
                    focusable="false"
                >
                    <path
                        ref={(el) => {
                            refs.panelBodyShape = el;
                        }}
                        fill="none"
                        stroke={RIM_PAINT}
                        strokeOpacity={RIM_ALPHA}
                        strokeWidth={1}
                    />
                </svg>
            </div>
        </div>
    );
}
