/**
 * The colour a chatter's name is drawn in.
 *
 * Not `stableHoverColor` (lib/stable-hover-color.ts), which this deliberately
 * doesn't reuse: that palette is for row HOVER WASHES, so it carries two greys
 * and two near-white pastels at L≈0.95. As fills behind a row they read fine;
 * as 13px text on the near-black rail two of them are barely there and the
 * greys aren't identity at all.
 *
 * These are generated instead of hand-picked, at one fixed lightness and chroma
 * with only the hue turning. That's the property the surface needs — every name
 * lands at the same contrast against the canvas, so no chatter is quietly harder
 * to read than another, and the colour carries identity without carrying
 * emphasis. Twelve hues is enough to tell neighbours apart in a fast chat
 * without pretending to be unique per user.
 */

const COUNT = 12;

/** Readable on --color-canvas (rgb(5,5,5)) without shouting. */
const L = 0.82;
const C = 0.132;

/**
 * Hue 150 is skipped — it is lantern, the brand green, which on this surface
 * means "the app is telling you something" rather than "this is a person".
 */
const NAME_COLORS = Array.from({ length: COUNT }, (_, i) => {
    const hue = (i * (360 / COUNT) + 18) % 360;
    return `oklch(${L} ${C} ${hue.toFixed(1)})`;
});

/** Same user, same colour, on every client and every reload. */
export function chatNameColor(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
    return NAME_COLORS[hash % NAME_COLORS.length];
}
