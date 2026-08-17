/**
 * The scrubber preview card's size, in ONE place.
 *
 * It lives here because two files have to agree on it and previously didn't:
 * `thumbnail-hover.tsx` rendered the card at 280×158 while
 * `use-frame-thumbnails.ts` captured the frame at a hardcoded 160×90. That is a
 * 3.5x upscale per axis before the display's own pixel ratio doubles it again —
 * roughly 12x the pixel count invented by the browser, which is why the preview
 * looked so soft.
 *
 * Capture size is derived from these, so changing the card can no longer leave
 * the capture behind.
 */
export const CARD_W = 280;
export const CARD_H = 158;

/**
 * Pixels to actually capture, for a card of this size on this display.
 *
 * DPR is capped at 2 deliberately. A 3x phone would ask for 840×473, and the
 * cost here is not the memory — it is that every captured frame is JPEG-encoded
 * to a data URL on the main thread while the user is dragging. 2x is the point
 * where a 158px-tall card stops looking upscaled; past that it buys nothing
 * visible and spends real time per seek.
 */
export function previewCaptureSize(): { width: number; height: number } {
    const dpr = typeof window === "undefined" ? 2 : Math.min(window.devicePixelRatio || 1, 2);
    return {
        width: Math.round(CARD_W * dpr),
        height: Math.round(CARD_H * dpr),
    };
}
