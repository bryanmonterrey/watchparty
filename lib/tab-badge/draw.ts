// Paints the unread badge onto the app mark and returns a favicon data URL.
//
// Split out of the component so it is a pure, browser-only function with no
// React in its import graph — which is what makes it verifiable in a real
// Chrome (scripts/dev/verify-favicon-badge.mjs). The first version of this
// shipped unverified and drew nothing.

/** Sidebar's notification red — `--color-notification`, resolved to sRGB. */
export const NOTIFICATION_COLOR = "#ff3040";
const BADGE_INK = "#ffffff";

/**
 * The PNG, not app/icon.svg. This composites on a canvas, and an SVG is the
 * fragile input for that — it has to be decoded first, and any miss leaves the
 * tab with no badge at all. The 192px PNG always decodes and is already served
 * from public/.
 */
export const BASE_ICON = "/icon-192.png";

export function badgeText(count: number): string {
    return count > 999 ? "999+" : String(count);
}

/**
 * Returns a PNG data URL, or null if the base icon can't be decoded.
 *
 * Sized for a 16px tab: the badge takes a deliberately large share of the mark,
 * because at that scale a tasteful little dot is just a smudge.
 */
export async function drawFaviconBadge(count: number, baseIcon: string = BASE_ICON): Promise<string | null> {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const img = new Image();
    // No crossOrigin: this is a same-origin asset, so the canvas stays clean
    // without it, and asking for CORS on same-origin only adds a way to fail.
    const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = baseIcon;
    });
    if (!loaded) return null;

    ctx.drawImage(img, 0, 0, size, size);

    const text = badgeText(count);
    const h = 40;
    ctx.font = `bold ${h - 8}px system-ui, -apple-system, sans-serif`;
    const w = Math.min(size, Math.max(h, ctx.measureText(text).width + 14));
    // Centred on the horizontal axis rather than pinned to the right edge:
    // right-anchoring reads as lopsided once the pill widens past two digits,
    // and at 16px the badge is most of what you see anyway. Still bottom-
    // anchored, so the mark stays recognisable above it.
    const x = (size - w) / 2;
    const y = size - h;
    const r = h / 2;

    // The ring around the pill used to be punched out with `destination-out`,
    // i.e. transparent — which on a tab shows the browser's chrome through it
    // and reads as a stray border in whatever colour that happens to be. It is
    // the notification red instead, so the badge is one solid shape.
    //
    // Clamped to the canvas: the pill is centred and already spans the full
    // width at three digits, so the ring would otherwise be cropped by the
    // edges unevenly and pull the badge off centre.
    const g = 4;
    const ox = Math.max(0, x - g);
    const oy = Math.max(0, y - g);
    const ow = Math.min(size - ox, w + g * 2);
    const oh = Math.min(size - oy, h + g * 2);

    ctx.fillStyle = NOTIFICATION_COLOR;
    ctx.beginPath();
    ctx.roundRect(ox, oy, ow, oh, Math.min(r + g, oh / 2));
    ctx.fill();

    ctx.fillStyle = BADGE_INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // +1px optical centring: the cap-height box sits high in the em box.
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);

    return canvas.toDataURL("image/png");
}
