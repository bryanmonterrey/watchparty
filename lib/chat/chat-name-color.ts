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
 * The palette — and also exactly what the Identity panel offers.
 *
 * Offering the same twelve the automatic assignment draws from is what keeps
 * the guarantee above true for CHOSEN colours too: there is no swatch a user
 * can pick that reads worse than the one they were given.
 *
 * The 18-degree offset puts hue 150 between stops — that's lantern, the brand
 * green, which on this surface means "the app is telling you something" rather
 * than "this is a person".
 */
export const CHAT_NAME_COLORS = Array.from({ length: COUNT }, (_, i) => {
    const hue = (i * (360 / COUNT) + 18) % 360;
    return `oklch(${L} ${C} ${hue.toFixed(1)})`;
});

/** Same user, same colour, on every client and every reload. */
export function chatNameColor(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
    return CHAT_NAME_COLORS[hash % CHAT_NAME_COLORS.length];
}

/** True for a value this app issued. Guards the stored column against anything else. */
export function isChatNameColor(value: string): boolean {
    return CHAT_NAME_COLORS.includes(value);
}

/**
 * What a chatter's name is actually drawn in: their choice if they made one,
 * otherwise the colour their id hashes to.
 *
 * Stored values are re-validated rather than trusted — a row written before a
 * palette change (or by hand) must not be able to paint a name black on black.
 */
export function resolveChatNameColor(userId: string, stored?: string | null): string {
    return stored && isChatNameColor(stored) ? stored : chatNameColor(userId);
}
