/* The liquid popover's element bag — every DOM node the engines, the
   geometry writer and the goo canvas touch, as ONE mutable object.

   Plain properties assigned by callback refs, not React RefObjects: the bag
   is created once per component instance and handed to modules that read it
   at gesture/tick time (stretch, seam, measure), so `refs.blobTrigger` is
   always the live node without a `.current` hop at forty call sites. */

export interface LiquidRefs {
    root: HTMLDivElement | null;
    goo: SVGSVGElement | null;
    bodies: HTMLDivElement | null;
    blobTrigger: SVGRectElement | null;
    blobPanel: SVGPathElement | null;
    chain: (SVGCircleElement | null)[];
    /* The resting panel, in three pieces: the BOX (positioned by geometry,
       transformed by gsap — it carries no paint), the GLASS inside it (the
       tinted, backdrop-blurred face, cut to the squircle by clip-path) and
       the RIM svg beside the glass, which draws the border as a real stroke.
       The rim is a SIBLING of the glass, never a child: the clip-path would
       shave the half of a 1px stroke that falls outside the contour. */
    panelBody: HTMLDivElement | null;
    panelGlass: HTMLDivElement | null;
    panelRim: SVGSVGElement | null;
    panelBodyShape: SVGPathElement | null;
    panel: HTMLDivElement | null;
    scroller: HTMLDivElement | null;
    trigger: HTMLButtonElement | null;
    items: (HTMLElement | null)[];
    itemInners: (HTMLElement | null)[];
    headerInner: HTMLDivElement | null;
    blur: SVGFEGaussianBlurElement | null;
    rimEdge: SVGFEColorMatrixElement | null;
    innerEdge: SVGFEColorMatrixElement | null;
    maskBlur: SVGFEGaussianBlurElement | null;
    maskRimEdge: SVGFEColorMatrixElement | null;
    maskInnerEdge: SVGFEColorMatrixElement | null;
    gooFilter: SVGFilterElement | null;
    rimFilter: SVGFilterElement | null;
    rimMask: SVGMaskElement | null;
    seamGradients: (SVGRadialGradientElement | null)[];
    seamPaints: (SVGRectElement | null)[];
    seamStops: (SVGStopElement | null)[][];
}

export function createLiquidRefs(): LiquidRefs {
    return {
        root: null,
        goo: null,
        bodies: null,
        blobTrigger: null,
        blobPanel: null,
        chain: [],
        panelBody: null,
        panelGlass: null,
        panelRim: null,
        panelBodyShape: null,
        panel: null,
        scroller: null,
        trigger: null,
        items: [],
        itemInners: [],
        headerInner: null,
        blur: null,
        rimEdge: null,
        innerEdge: null,
        maskBlur: null,
        maskRimEdge: null,
        maskInnerEdge: null,
        gooFilter: null,
        rimFilter: null,
        rimMask: null,
        seamGradients: [],
        seamPaints: [],
        seamStops: [],
    };
}
