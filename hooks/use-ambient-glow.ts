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

export function useAmbientGlow(
    videoRef: React.RefObject<HTMLVideoElement | null>,
    options?: AmbientGlowOptions,
    enabled = true,
) {
    useEffect(() => {
        if (!enabled) return;
        const videoEl = videoRef.current;
        if (!videoEl) return;

        const glow = new AmbientGlow(videoEl, { ...DEFAULTS, ...options });
        return () => { glow.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);
}
