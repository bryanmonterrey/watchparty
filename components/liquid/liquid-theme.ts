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

export const ACCENT = "#358efc";

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
   on a near-black rim (liquid-taffy's seamHue). */
export const SEAM_PAINT = mixHex(ACCENT, "#ffffff", 0.08);

/* The neon under a lit row: the accent at partial opacity, twice — a tight
   core and a wider bloom. Brand-tinted glow, per the house shadow rule. */
export function neonGlow(hue: string) {
    return `drop-shadow(0 0 3px ${hue}e6) drop-shadow(0 0 8px ${hue}80)`;
}

/* The rim is a SOLID: the goo draws its border by flooding one flat colour
   into the sliver between two contours, so a translucent rim would tint
   whatever the liquid is flying over and double against the crisp border
   beneath it. This is the app's slate hairline rgba(138,145,158,0.2)
   pre-composited over the panel fill — one border, whatever the liquid does. */
export function solidRim(fill: string) {
    const hex = fill.length >= 7 ? fill.slice(0, 7) : "#111111";
    return mixHex(hex, "#8a919e", 0.2);
}
