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

/* THE DEMO'S PALETTE, adopted whole (owner call 2026-08-20 — "use demo's").
   These are liquid-taffy's dark-frame values verbatim: the panel surface is
   the stage grey, the rim the Figma 6%-white stroke pre-composited over it,
   and the joint light the family's lifted seam violet. The app's twitter2
   accent stays out of the liquid — the popover speaks the reference's
   colour language. */
export const LIQUID_SURFACE = "#212326";
export const LIQUID_RIM = "#2f3235";
/* The dark frame's seam — what a joint lights in, and what a welded row's
   neon blooms with (the demo colours neon by each row's own motif hue; app
   rows carry none, so they fall back to the family's one violet, exactly as
   the demo's no-motif path does). */
export const LIQUID_SEAM = "#8a68ff";

export function mixHex(one: string, two: string, amount: number) {
    const parse = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    const [r1, g1, b1] = parse(one);
    const [r2, g2, b2] = parse(two);
    const blend = (a: number, b: number) => Math.round(a + (b - a) * amount);
    return `#${[blend(r1, r2), blend(g1, g2), blend(b1, b2)]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")}`;
}

export const SEAM_PAINT = LIQUID_SEAM;

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
