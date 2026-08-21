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

/* GLASS (owner call 2026-08-21). The face is the fill at 10% behind a 12px
   backdrop blur — Tailwind's `backdrop-blur-md`, in px because the panel is
   painted from measured geometry, not classes.

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
export const SURFACE_ALPHA = 0.1;
export const BACKDROP_BLUR = "blur(12px)";

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

/* The rim is a SOLID: the goo draws its border by flooding one flat colour
   into the sliver between two contours, so a translucent rim would tint
   whatever the liquid is flying over and double against the crisp border
   beneath it. The demo surface gets the demo's exact stroke; a custom fill
   gets the same recipe — ~6.5% white composited over the face. */
export function solidRim(fill: string) {
    const hex = fill.length >= 7 ? fill.slice(0, 7) : LIQUID_SURFACE;
    if (hex.toLowerCase() === LIQUID_SURFACE) {
        return LIQUID_RIM;
    }
    return mixHex(hex, "#ffffff", 0.065);
}
