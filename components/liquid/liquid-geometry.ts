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
    const panelLeft =
        align === "start"
            ? alignOffset
            : align === "center"
              ? (tw - panelW) / 2 + alignOffset
              : tw - panelW - alignOffset;
    const panelTop = side === "bottom" ? th + gap : -(gap + panelH);

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
    const body = refs.panelBody;
    if (body) {
        body.setAttribute("width", String(panelW));
        body.setAttribute("height", String(panelH));
        body.setAttribute("viewBox", `0 0 ${panelW} ${panelH}`);
        body.style.left = `${panelLeft}px`;
        body.style.top = `${panelTop}px`;
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
