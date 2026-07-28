"use client";

import { useEffect } from "react";
import { AmbientGlow } from "video-ambient-glow";

interface AmbientGlowOptions {
    blur?: number;
    opacity?: number;
    brightness?: number;
    saturate?: number;
    scale?: number;
    downscale?: number;
    updateInterval?: number;
    responsiveness?: number;
}

const DEFAULTS: AmbientGlowOptions = {
    blur: 120,
    opacity: 0.5,
    brightness: 1.1,
    saturate: 1.2,
    scale: 1.05,
    downscale: 0.1,
    updateInterval: 98,
    responsiveness: 0.1,
};

/**
 * The app's glow — home's hero tuning, now every player's.
 *
 * A tight halo rather than a wide wash: blur 28 at low opacity, so the glow
 * reads as the frame CONTINUING past its edges instead of a haze bleeding onto
 * the page. The other players ran blur 120 and the difference was obvious next
 * to home.
 *
 * `scale` is the ONE number that isn't home's. It was 1 — the canvas exactly
 * the size of the video box — and a blurred element fades out at its own edges,
 * so the glow feathered to nothing right at the frame border. On a 16:9 video
 * the video covers that, but a square or portrait one letterboxes and the bars
 * showed a dark rim hugging the frame: a ring that reads as an inner shadow.
 * 1.08 (the library's own default) pushes the canvas ~4% past each edge, which
 * is more than the 28px of blur, so the fade now happens OUTSIDE the frame and
 * the bars fill evenly. Colour, blur, opacity and brightness are untouched —
 * only how far the canvas reaches.
 *
 * EVERY key is spelled out, including the ones that match the defaults above:
 * the live player builds its AmbientGlow by hand rather than through the hook
 * (its lifecycle is tied to the IVS player's), so it never sees DEFAULTS. A
 * partial preset would silently drift between the two call styles.
 */
export const AMBIENT_PRESET: AmbientGlowOptions = {
    blur: 28,
    opacity: 0.35,
    brightness: 1.05,
    saturate: 1.2,
    scale: 1.08,
    downscale: 0.1,
    updateInterval: 98,
    responsiveness: 0.1,
};

export function useAmbientGlow(
    videoRef: React.RefObject<HTMLVideoElement | null>,
    options?: AmbientGlowOptions,
    enabled = true,
) {
    // Keyed on the option VALUES, not the object. The effect used to depend on
    // `enabled` alone, so an instance kept whatever it was constructed with and
    // every later tweak to blur/scale/opacity was silently ignored — the glow
    // stayed on this file's DEFAULTS no matter what a caller passed.
    //
    // Serialising rather than depending on the object matters: callers pass an
    // inline literal (`{ brightness: 1.5 }`), which is a new identity every
    // render and would tear down and rebuild the canvas on each one.
    const signature = JSON.stringify(options ?? {});

    useEffect(() => {
        if (!enabled) return;
        const videoEl = videoRef.current;
        if (!videoEl) return;

        const glow = new AmbientGlow(videoEl, { ...DEFAULTS, ...(JSON.parse(signature) as AmbientGlowOptions) });
        return () => { glow.destroy(); };
    }, [enabled, signature, videoRef]);
}
