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

/* THE GRAIN — one tile from /public laid over every popover face, so the flat
   fill reads as a material instead of a perfectly clean plane.

   The tile is coloured noise on white, which is why it goes on in `overlay`
   and not straight: over a near-black face overlay is ≈2×base×blend, i.e. a
   faint coloured lift, where a plain alpha composite would just wash the
   surface toward white. It is laid at its NATIVE size and repeated — scaling a
   noise tile is what turns grain into visible blotches.

   One place, both engines: the SVG pattern on the liquid panel
   (liquid-popover.tsx) and the `.surface-noise` utility in globals.css, which
   is what the Radix popover/dialog surfaces wear. Change the alpha here and in
   the utility together — they are the same treatment on two rendering models. */
export const NOISE_SRC = "/noise-color.png";
/** The PNG's own pixel size (123×122); repeated, never scaled. */
export const NOISE_TILE_W = 123;
export const NOISE_TILE_H = 122;
export const NOISE_OPACITY = 0.3;

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
