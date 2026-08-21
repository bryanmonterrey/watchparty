"use client";

/* Layer 2 of the liquid popover: the goo — the moving picture. It draws its
   own rim (the sliver between two iso-alpha contours of one blurred alpha,
   see liquid/goo.ts) and the seam wash the border lights with on contact.
   A REAL <svg> with the filter on a <g>, because Safari won't reliably
   re-render `filter: url()` applied to an HTML element whose children
   animate. Sized and placed by liquid-geometry's measureLiquid. */

import { memo } from "react";

import { GOO_RIM_THRESHOLDS, gooThreshold } from "./goo";
import type { LiquidRefs } from "./liquid-refs";
import { GOO_FACE_ALPHA, SEAM_PAINT } from "./liquid-theme";
import { GRAB_CHAIN } from "./stretch";

const GOO_BLUR_REST = 1;

export interface GooCanvasIds {
    goo: string;
    blobs: string;
    rimOnly: string;
    rimMask: string;
    seamGradient: string;
}

/* Two seam layers: only one pair exists here (trigger|panel), the second is
   the spare that lets a re-contact light while the previous light dies. */
export const SEAM_LAYERS = [0, 1] as const;

function LiquidGooCanvasImpl({
    refs,
    ids,
    fill,
    rim,
}: {
    refs: LiquidRefs;
    ids: GooCanvasIds;
    fill: string;
    rim: string;
}) {
    return (
        <svg
            ref={(el) => {
                refs.goo = el;
            }}
            className="pointer-events-none absolute z-[1] overflow-visible"
            /* Hidden in the MARKUP, not only by the mount effect: the SSR HTML
               must arrive invisible, or every menu paints for the beat before
               hydration. gsap's autoAlpha overwrites these same two
               properties, and React never rewrites an unchanged style prop,
               so the two owners cannot fight. */
            style={{ opacity: 0, visibility: "hidden" }}
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <filter
                    ref={(el) => {
                        refs.gooFilter = el;
                    }}
                    id={ids.goo}
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                >
                    {/* blur + alpha threshold = the metaball neck between near
                        surfaces; the two contours between them are the rim. */}
                    <feGaussianBlur
                        ref={(el) => {
                            refs.blur = el;
                        }}
                        in="SourceGraphic"
                        stdDeviation={GOO_BLUR_REST}
                        result="blur"
                    />
                    <feColorMatrix
                        ref={(el) => {
                            refs.rimEdge = el;
                        }}
                        in="blur"
                        type="matrix"
                        values={gooThreshold(GOO_RIM_THRESHOLDS[GOO_BLUR_REST][0])}
                        result="goo"
                    />
                    <feColorMatrix
                        ref={(el) => {
                            refs.innerEdge = el;
                        }}
                        in="blur"
                        type="matrix"
                        values={gooThreshold(GOO_RIM_THRESHOLDS[GOO_BLUR_REST][1])}
                        result="inner"
                    />
                    {/* THE LIQUID IS GLASS TOO. The alpha is dropped AFTER the
                        threshold, never before: the metaball is built by
                        thresholding alpha, so a translucent blob going IN is
                        erased by its own threshold — the picture disappears
                        rather than fading.

                        Which forces the rim to become the SLIVER (outer minus
                        inner) instead of a flood over the whole outer shape.
                        The old chain could paint rim colour edge-to-edge
                        because an opaque interior covered all but the border;
                        with a 10% interior that entire mass would show through
                        as one rim-coloured blob. */}
                    <feComposite in="goo" in2="inner" operator="out" result="sliver" />
                    {/* The flood is the SAME solid the crisp border wears, or
                        the two pictures would not match at a handoff. */}
                    <feFlood floodColor={rim} result="rimColor" />
                    <feComposite in="rimColor" in2="sliver" operator="in" result="rimFull" />
                    {/* The face, carried at the resting panel's alpha. Alpha
                        only — feColorMatrix works on unpremultiplied channels,
                        so the blob's colour survives untouched. */}
                    <feColorMatrix
                        in="inner"
                        type="matrix"
                        values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${GOO_FACE_ALPHA} 0`}
                        result="face"
                    />
                    <feMerge>
                        <feMergeNode in="face" />
                        <feMergeNode in="rimFull" />
                    </feMerge>
                </filter>

                {/* The SAME chain again — one blur, one pair of thresholds, so
                    the sliver this carves is the exact sliver the goo paints.
                    Flooded white, interior dropped: a mask of the border and
                    nothing else. */}
                <filter
                    ref={(el) => {
                        refs.rimFilter = el;
                    }}
                    id={ids.rimOnly}
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                >
                    <feGaussianBlur
                        ref={(el) => {
                            refs.maskBlur = el;
                        }}
                        in="SourceGraphic"
                        stdDeviation={GOO_BLUR_REST}
                        result="blur"
                    />
                    <feColorMatrix
                        ref={(el) => {
                            refs.maskRimEdge = el;
                        }}
                        in="blur"
                        type="matrix"
                        values={gooThreshold(GOO_RIM_THRESHOLDS[GOO_BLUR_REST][0])}
                        result="outer"
                    />
                    <feColorMatrix
                        ref={(el) => {
                            refs.maskInnerEdge = el;
                        }}
                        in="blur"
                        type="matrix"
                        values={gooThreshold(GOO_RIM_THRESHOLDS[GOO_BLUR_REST][1])}
                        result="inner"
                    />
                    <feComposite in="outer" in2="inner" operator="out" result="rimOnly" />
                    <feFlood floodColor="#ffffff" result="white" />
                    <feComposite in="white" in2="rimOnly" operator="in" />
                </filter>

                <mask
                    ref={(el) => {
                        refs.rimMask = el;
                    }}
                    id={ids.rimMask}
                    maskUnits="userSpaceOnUse"
                >
                    {/* The same blobs through the rim filter — a <use>
                        instance, so the mask cannot drift from the picture. */}
                    <g filter={`url(#${ids.rimOnly})`}>
                        <use href={`#${ids.blobs}`} />
                    </g>
                </mask>

                {/* One lobe per lit body: the accent at the joint, dying out
                    by OPACITY along the border — clean hue over rim, never a
                    muddy mix. Centre/radius are the seam engine's. */}
                {SEAM_LAYERS.map((layer) => (
                    <radialGradient
                        key={layer}
                        ref={(el) => {
                            refs.seamGradients[layer] = el;
                        }}
                        id={`${ids.seamGradient}-${layer}`}
                        gradientUnits="userSpaceOnUse"
                    >
                        {[
                            { offset: 0, alpha: 1 },
                            { offset: 55, alpha: 0.9 },
                            { offset: 100, alpha: 0 },
                        ].map(({ offset, alpha }, stop) => (
                            <stop
                                key={offset}
                                ref={(el) => {
                                    refs.seamStops[layer] = refs.seamStops[layer] ?? [];
                                    refs.seamStops[layer][stop] = el;
                                }}
                                offset={`${offset}%`}
                                stopColor={SEAM_PAINT}
                                stopOpacity={alpha}
                            />
                        ))}
                    </radialGradient>
                ))}
            </defs>
            <g filter={`url(#${ids.goo})`}>
                <g id={ids.blobs}>
                    <rect
                        ref={(el) => {
                            refs.blobTrigger = el;
                        }}
                        fill={fill}
                        className="will-change-transform"
                    />
                    {GRAB_CHAIN.map((link, index) => (
                        <circle
                            key={link.follow}
                            ref={(el) => {
                                refs.chain[index] = el;
                            }}
                            fill={fill}
                            className="will-change-transform"
                        />
                    ))}
                    <path
                        ref={(el) => {
                            refs.blobPanel = el;
                        }}
                        fill={fill}
                        className="will-change-transform"
                    />
                </g>
            </g>

            {/* The accent rides the border itself: a full-canvas wash cut down
                to the rim by the mask. Opacity is the seam engine's only
                output. Hidden, not merely transparent — the mask runs the
                goo's blur a second time, and a browser only skips that for
                something it is not painting. */}
            {SEAM_LAYERS.map((layer) => (
                <rect
                    key={layer}
                    ref={(el) => {
                        refs.seamPaints[layer] = el;
                    }}
                    x="0"
                    y="0"
                    fill={`url(#${ids.seamGradient}-${layer})`}
                    mask={`url(#${ids.rimMask})`}
                    style={{ opacity: 0, visibility: "hidden", pointerEvents: "none", willChange: "opacity" }}
                />
            ))}
        </svg>
    );
}

/* Memoized: the parent re-renders on every hover-target change, and this
   subtree is the expensive one (two filter chains, a mask, gradients) with
   fully stable props — the refs bag and ids never change identity. */
export const LiquidGooCanvas = memo(LiquidGooCanvasImpl);
