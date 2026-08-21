/* The liquid popover's geometry — measured off the live DOM and written
   straight to the SVG picture (canvas, filter regions, blobs, transform
   origins), so an open that follows a content change never pours from stale
   coordinates. React never touches these attributes, so the imperative
   writes cannot be clobbered by a re-render. */

import gsap from "gsap";

import type { LiquidRefs } from "./liquid-refs";
import { squirclePath } from "./squircle-path";

/* Canvas headroom on every side: a finger pulled the full GRAB_MAX (44) plus
   its head's radius plus the blur's three-σ tail, measured from the body's
   edge. Anything past the canvas is cut off with a straight edge and no rim. */
const CANVAS_PAD = 72;

/* The lit stretch of border at rest — the seam engine drives the real one. */
export const SEAM_RADIUS = 20;

/* Breathing room between the panel and whatever edge it is avoiding. */
const EDGE_MARGIN = 8;

/* The box the panel is allowed to occupy, in viewport coordinates.

   The viewport is only half of it. This popover does NOT portal, so an
   ancestor that scrolls CLIPS it — a rail row's menu is cut off by
   rail-card's `overflow-y-auto` long before it reaches the window's edge, and
   no amount of z-index escapes an overflow clip. So the safe box is the
   viewport intersected with every clipping ancestor's rect, and flipping is
   decided against that.

   The ancestor list is cached on the refs bag: measure() runs on mount, on
   every ResizeObserver fire and before every open and grab, and walking the
   tree with getComputedStyle each time is exactly the per-popover layout cost
   that made /feed unusable once already. The chain a popover hangs in does
   not change during its life. */
function safeBox(refs: LiquidRefs, triggerEl: HTMLElement) {
    if (!refs.clipAncestors) {
        const found: HTMLElement[] = [];
        let node = triggerEl.parentElement;
        while (node && node !== document.body) {
            const { overflowX, overflowY } = getComputedStyle(node);
            if (overflowX !== "visible" || overflowY !== "visible") {
                found.push(node);
            }
            node = node.parentElement;
        }
        refs.clipAncestors = found;
    }

    let left = EDGE_MARGIN;
    let top = EDGE_MARGIN;
    let right = window.innerWidth - EDGE_MARGIN;
    let bottom = window.innerHeight - EDGE_MARGIN;

    for (const node of refs.clipAncestors) {
        const box = node.getBoundingClientRect();
        left = Math.max(left, box.left);
        top = Math.max(top, box.top);
        right = Math.min(right, box.right);
        bottom = Math.min(bottom, box.bottom);
    }
    return { left, top, right, bottom };
}

export interface GeomParams {
    width: number;
    align: "start" | "center" | "end";
    alignOffset: number;
    side: "top" | "bottom";
    gap: number;
    panelRadius: number;
}

export interface Geom {
    tw: number;
    th: number;
    panelW: number;
    panelH: number;
    panelLeft: number;
    panelTop: number;
    canvasLeft: number;
    canvasTop: number;
    canvasW: number;
    canvasH: number;
    /* Trigger box and panel box in goo-canvas coordinates. */
    trigger: { x: number; y: number; w: number; h: number; r: number };
    panel: { x: number; y: number; w: number; h: number; r: number };
    /* Trigger center, canvas coords — where the seam gradients default. */
    tcx: number;
    tcy: number;
    /* The pour origin, panel-local — the trigger's center. */
    originX: number;
    originY: number;
    restScale: number;
    chainR: number;
    /* The side the panel ACTUALLY took, after collision. The caller's `side`
       is a preference; this is the answer, and the open choreography reads it
       so the row stagger runs from the edge the panel grew out of. */
    side: "top" | "bottom";
}

export function measureLiquid(refs: LiquidRefs, params: GeomParams): Geom | null {
    const { width, align, alignOffset, side, gap, panelRadius } = params;
    const triggerEl = refs.trigger;
    const panelEl = refs.panel;
    if (!triggerEl || !panelEl) {
        return null;
    }
    const tw = triggerEl.offsetWidth || 32;
    const th = triggerEl.offsetHeight || 32;
    const panelW = panelEl.offsetWidth || width;
    const panelH = panelEl.offsetHeight || 0;
    /* ── Placement, collision-aware ───────────────────────────────────
       Everything here is trigger-local (0,0 is the trigger's top-left), and
       the trigger's own viewport rect is what converts between the two. */
    const wantedLeft =
        align === "start"
            ? alignOffset
            : align === "center"
              ? (tw - panelW) / 2 + alignOffset
              : tw - panelW - alignOffset;

    const anchor = triggerEl.getBoundingClientRect();
    const safe = safeBox(refs, triggerEl);

    /* FLIP. The preferred side wins unless it does not fit and the other one
       does — never flip into a worse spot, and never flip a panel that fits.
       panelH is 0 before the rows have laid out, which reads as "fits"; that
       first measure is a mount, and the pre-open measure runs again with a
       real height. */
    const roomBelow = safe.bottom - (anchor.bottom + gap);
    const roomAbove = anchor.top - gap - safe.top;
    const fitsBelow = panelH <= roomBelow;
    const fitsAbove = panelH <= roomAbove;
    const resolvedSide: "top" | "bottom" =
        side === "bottom"
            ? fitsBelow || !fitsAbove
                ? "bottom"
                : "top"
            : fitsAbove || !fitsBelow
              ? "top"
              : "bottom";

    /* SHIFT. Slide along the align axis to stay inside the box rather than
       flipping — a menu that jumps its alignment reads as a different menu.
       Clamped low-edge-last so a panel wider than the box pins to its left
       edge instead of its right, which is where the rows start. */
    let panelLeft = wantedLeft;
    const viewportLeft = anchor.left + panelLeft;
    const overRight = viewportLeft + panelW - safe.right;
    if (overRight > 0) panelLeft -= overRight;
    const underLeft = safe.left - (anchor.left + panelLeft);
    if (underLeft > 0) panelLeft += underLeft;

    const panelTop = resolvedSide === "bottom" ? th + gap : -(gap + panelH);

    const canvasLeft = Math.min(0, panelLeft) - CANVAS_PAD;
    const canvasTop = Math.min(0, panelTop) - CANVAS_PAD;
    const canvasRight = Math.max(tw, panelLeft + panelW) + CANVAS_PAD;
    const canvasBottom = Math.max(th, panelTop + panelH) + CANVAS_PAD;
    const canvasW = canvasRight - canvasLeft;
    const canvasH = canvasBottom - canvasTop;

    const originX = tw / 2 - panelLeft;
    const originY = th / 2 - panelTop;
    /* Resting scale: the shrunk panel must hide entirely inside the trigger.
       The farthest panel corner sits `far` px from the pour origin; far ×
       scale stays under a third of the trigger's smaller side even while the
       press squash and the landing splat deform the button. */
    const far = Math.max(
        Math.hypot(originX, originY),
        Math.hypot(panelW - originX, originY),
        Math.hypot(originX, panelH - originY),
        Math.hypot(panelW - originX, panelH - originY),
    );
    const restScale = Math.min(0.1, Math.max(0.02, (Math.min(tw, th) * 0.36) / Math.max(1, far)));

    const geom: Geom = {
        tw,
        th,
        panelW,
        panelH,
        panelLeft,
        panelTop,
        canvasLeft,
        canvasTop,
        canvasW,
        canvasH,
        trigger: { x: -canvasLeft, y: -canvasTop, w: tw, h: th, r: Math.min(tw, th) / 2 },
        panel: {
            x: panelLeft - canvasLeft,
            y: panelTop - canvasTop,
            w: panelW,
            h: panelH,
            r: panelRadius,
        },
        tcx: tw / 2 - canvasLeft,
        tcy: th / 2 - canvasTop,
        originX,
        originY,
        restScale,
        chainR: Math.max(8, Math.round(Math.min(tw, th) * 0.34)),
        side: resolvedSide,
    };

    /* ── Write the picture ───────────────────────────────────────────── */

    const svg = refs.goo;
    if (svg) {
        svg.setAttribute("width", String(canvasW));
        svg.setAttribute("height", String(canvasH));
        svg.setAttribute("viewBox", `0 0 ${canvasW} ${canvasH}`);
        svg.style.left = `${canvasLeft}px`;
        svg.style.top = `${canvasTop}px`;
    }
    /* Filter regions are the WHOLE canvas in user units — a percentage region
       is measured off whatever the blobs occupy, which at rest is barely the
       trigger, and the crop crawls as a finger extends. */
    [refs.gooFilter, refs.rimFilter, refs.rimMask].forEach((region) => {
        region?.setAttribute("x", "0");
        region?.setAttribute("y", "0");
        region?.setAttribute("width", String(canvasW));
        region?.setAttribute("height", String(canvasH));
    });
    const blobTrigger = refs.blobTrigger;
    if (blobTrigger) {
        blobTrigger.setAttribute("x", String(geom.trigger.x));
        blobTrigger.setAttribute("y", String(geom.trigger.y));
        blobTrigger.setAttribute("width", String(tw));
        blobTrigger.setAttribute("height", String(th));
        blobTrigger.setAttribute("rx", String(geom.trigger.r));
    }
    refs.blobPanel?.setAttribute(
        "d",
        squirclePath(geom.panel.x, geom.panel.y, panelW, panelH, panelRadius),
    );
    /* The chain's untransformed spot is the stretch engine's own origin
       (anchor left + buttonSize/2 on both axes), so the engine's relative
       x/y land the beads exactly where the grab is. */
    refs.chain.forEach((bead) => {
        bead?.setAttribute("cx", String(tw / 2 - canvasLeft));
        bead?.setAttribute("cy", String(tw / 2 - canvasTop));
        bead?.setAttribute("r", String(geom.chainR));
    });
    refs.seamGradients.forEach((gradient) => {
        gradient?.setAttribute("cx", String(geom.tcx));
        gradient?.setAttribute("cy", String(geom.tcy));
        gradient?.setAttribute("r", String(SEAM_RADIUS));
    });
    refs.seamPaints.forEach((paint) => {
        paint?.setAttribute("width", String(canvasW));
        paint?.setAttribute("height", String(canvasH));
    });
    /* The box the glass and the rim both live in — an HTML div, sized in px
       (it is the element gsap transforms, and the one whose border box the
       backdrop blur samples through). */
    const body = refs.panelBody;
    if (body) {
        body.style.width = `${panelW}px`;
        body.style.height = `${panelH}px`;
        body.style.left = `${panelLeft}px`;
        body.style.top = `${panelTop}px`;
    }
    /* The glass is cut to the OUTER contour (0,0 → W,H) while the rim strokes
       the centreline half a pixel in. Clipping the glass to the stroke's own
       path instead would leave the outer half-pixel of the border sitting on
       bare backdrop, which reads as a frayed edge on a translucent panel. */
    if (refs.panelGlass) {
        refs.panelGlass.style.clipPath = `path("${squirclePath(0, 0, panelW, panelH, panelRadius)}")`;
    }
    const rim = refs.panelRim;
    if (rim) {
        rim.setAttribute("width", String(panelW));
        rim.setAttribute("height", String(panelH));
        rim.setAttribute("viewBox", `0 0 ${panelW} ${panelH}`);
    }
    refs.panelBodyShape?.setAttribute(
        "d",
        squirclePath(0.5, 0.5, panelW - 1, panelH - 1, panelRadius),
    );
    if (refs.panel) {
        refs.panel.style.left = `${panelLeft}px`;
        refs.panel.style.top = `${panelTop}px`;
    }
    /* The pour origin — px transform origins are bbox-relative for SVG
       elements, so panel-local coordinates serve all three panel pieces. */
    gsap.set([refs.blobPanel, refs.panelBody, refs.panel], {
        transformOrigin: `${originX}px ${originY}px`,
    });
    return geom;
}

/* The blur is re-rasterized over the FILTER REGION every frame of a flight,
   and the region measureLiquid writes carries 72px of grab headroom on every
   side — needed for a pulled finger, pure cost for a plain open/close (the
   reference's whole canvas was 320×308; a 450px menu's is several times
   that, and the difference is the open stutter). This tightens the region to
   the trigger∪panel bounds plus the blur's own tail while the picture is
   only pouring; the next grab's measure() restores the full region. */
export function setLiquidFilterRegion(refs: LiquidRefs, geom: Geom, mode: "flight" | "grab") {
    /* 24px ≈ three σ at the working blur (5) plus the rim — past that the
       filter output is zero anyway. */
    const inset = 24;
    const x0 =
        mode === "grab" ? 0 : Math.max(0, Math.min(geom.trigger.x, geom.panel.x) - inset);
    const y0 =
        mode === "grab" ? 0 : Math.max(0, Math.min(geom.trigger.y, geom.panel.y) - inset);
    const x1 =
        mode === "grab"
            ? geom.canvasW
            : Math.min(geom.canvasW, Math.max(geom.trigger.x + geom.trigger.w, geom.panel.x + geom.panel.w) + inset);
    const y1 =
        mode === "grab"
            ? geom.canvasH
            : Math.min(geom.canvasH, Math.max(geom.trigger.y + geom.trigger.h, geom.panel.y + geom.panel.h) + inset);
    [refs.gooFilter, refs.rimFilter, refs.rimMask].forEach((region) => {
        region?.setAttribute("x", String(x0));
        region?.setAttribute("y", String(y0));
        region?.setAttribute("width", String(x1 - x0));
        region?.setAttribute("height", String(y1 - y0));
    });
}
