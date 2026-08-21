/* The liquid popover's frame — watchparty's dark values, in one place.

   Locked to the DARK frame on purpose: the app's dropdown surfaces are
   fixed-dark (bg-canvas never lightens), so there is no theme context to
   thread. The motif hue is twitter2, the app's accent for active/selected
   states — the demo's per-row PlayStation hues are its content, not ours. */

/* Rows' inset — GooDropdown's PANEL_PAD, kept: rows are full-bleed and the
   width is the caller's. */
export const PANEL_PAD = 8;
/* Row corner radius — the app standard (rows are squircled, never rounded-*). */
export const ROW_RADIUS = 16;
export const SEPARATOR_ROW_H = 12;

/* THE DEMO'S SURFACE, the APP'S LIGHT (owner calls, both 2026-08-20): the
   panel wears liquid-taffy's dark-frame body verbatim — the stage grey and
   its Figma 6%-white stroke pre-composited into a solid — but the joint
   light and the welded-row neon speak twitter2, the app's accent. The demo's
   seam violet was tried and reverted the same day. */
export const LIQUID_SURFACE = "#212326";
export const LIQUID_RIM = "#2f3235";
export const ACCENT = "#358efc";

/* GLASS (owner call 2026-08-21). The face is the fill at SURFACE_ALPHA behind
   a 12px backdrop blur — Tailwind's `backdrop-blur-md`, in px because the
   panel is painted from measured geometry, not classes.

   This is why the face is an HTML div and no longer the SVG path's own fill:
   `backdrop-filter` needs a real box, and nothing samples a backdrop through
   an SVG `fill`. The path stays for the RIM, which has to be a stroke — a
   clip-path (the only way to cut a squircle) eats a CSS border.

   ⚠️ No ancestor of the glass may carry `isolation: isolate`, `opacity < 1`
   or a filter. Each of those is a BACKDROP ROOT, and the backdrop a blur can
   sample stops there — the panel would blur an empty group and show nothing.
   That is why the grain blends inside the glass rather than around it.

   ⚠️ If the blur ever renders empty or offset (Safari first), suspect the
   TRANSFORMED ancestor: gsap leaves a matrix on the panel box even at rest,
   and WebKit has historically mis-sampled a backdrop under one. The knobs, in
   order: drop `will-change-transform` from that box, then move the glass out
   of it and position it from geometry directly. */
export const SURFACE_ALPHA = 0.03;
export const BACKDROP_BLUR = "blur(12px)";

/* ONE blur, rest and flight alike (owner call: md, not lg). The glass is
   visible THROUGH the pour now — only the crisp rim is held back, so the goo
   owns the single border on screen — which is what puts a real backdrop blur
   in the transition at all. A heavier flight value was tried and dropped;
   if one is ever wanted again, it is a second constant written by liquidOn()
   and restored by liquidOff() in liquid-popover.tsx.

   ⚠️ That live backdrop-filter is re-sampled every frame of the animation,
   under a transform. It is the cheapest way to get blur into the transition —
   no third rasterization of the goo's filter chain — but it is not free. If a
   pour hitches on /feed, the off-switch is putting
   `gsap.set(refs.bodies, { autoAlpha: 0 })` back into liquidOn(). */

/* The face's tint, and the default fill. WHITE, because a wash this faint
   reads as a surface only where it CONTRASTS with its backdrop: this app is
   dark, so the old near-black tint was black-on-black. See GOO_PANEL_FILL. */
export const GLASS_TINT = "#ffffff";

/* The MOVING picture's face alpha — the goo canvas's, applied after the
   threshold (liquid-goo-canvas.tsx explains why the order matters).

   A QUARTER UNDER the resting glass (owner call). It used to be the same
   value, on the reasoning that the pour and the panel it becomes should be
   one material — but the glass now stays visible through the flight (that is
   what puts blur in the transition), so over the panel the two faces STACK
   and the pour was reading denser than the thing it settles into. Same tint,
   same material; this only takes the doubled region back down.

   The one thing motion cannot have is the BLUR: an SVG filter samples its own
   source graphic, never the page behind it, so the flying liquid is tint-and-
   rim only. Change this alone if the pour reads wrong against a busy
   background — it is the only lever here that does not touch the
   metaball. */
export const GOO_FACE_ALPHA = SURFACE_ALPHA * 0.75;

/** The face paint: an opaque brand hex carried in at SURFACE_ALPHA. */
export function glassFill(fill: string, alpha = SURFACE_ALPHA) {
    const hex = fill.length >= 7 ? fill.slice(0, 7) : LIQUID_SURFACE;
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* THE GRAIN lives in globals.css — `.grain-layer` (a child of the glass, so
   its `overlay` blend has the face to blend WITH) and `.surface-noise` (the
   pseudo-element form, for the Radix surfaces). The tile is /noise-color.png:
   coloured noise on white, laid at its native 123×122 and repeated. */

export function mixHex(one: string, two: string, amount: number) {
    const parse = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    const [r1, g1, b1] = parse(one);
    const [r2, g2, b2] = parse(two);
    const blend = (a: number, b: number) => Math.round(a + (b - a) * amount);
    return `#${[blend(r1, r2), blend(g1, g2), blend(b1, b2)]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")}`;
}

/* A whisper of white over the accent — just enough luminance for a 1px line
   on the near-black rim (liquid-taffy's seamHue, fed the app's accent). */
export const SEAM_PAINT = mixHex(ACCENT, "#ffffff", 0.08);

/* The neon under a lit row: the accent at partial opacity, twice — a tight
   core and a wider bloom. Brand-tinted glow, per the house shadow rule. */
export function neonGlow(hue: string) {
    return `drop-shadow(0 0 3px ${hue}e6) drop-shadow(0 0 8px ${hue}80)`;
}

/* THE RIM, now that the face is glass.

   It used to be a SOLID derived from the fill (~6.5% white over it), because
   the goo floods one flat colour into the sliver between its two contours and
   an opaque interior sat underneath. Neither half of that holds any more: the
   interior is a few percent, so a rim mixed from it is a dark line on a light
   wash, and there is nothing beneath it to double against — the crisp STROKE
   is held back while the goo flies (only the glass rides along), and the goo
   is hidden at rest, so exactly one border is ever on screen.

   So it is white at a fixed alpha, carried as colour + opacity rather than an
   rgba string: the crisp path takes stroke/stroke-opacity and the goo's
   feFlood takes flood-color/flood-opacity, and those two attribute pairs are
   the portable spelling on both. */
export const RIM_PAINT = "#ffffff";
export const RIM_ALPHA = 0.1;

/** Kept for a fill that goes back to opaque — see git history. */
export function solidRim(fill: string) {
    const hex = fill.length >= 7 ? fill.slice(0, 7) : LIQUID_SURFACE;
    if (hex.toLowerCase() === LIQUID_SURFACE) {
        return LIQUID_RIM;
    }
    return mixHex(hex, "#ffffff", 0.065);
}
