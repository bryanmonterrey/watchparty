"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scrubber previews drawn from the video itself: a detached <video> + <canvas>
 * pair that seeks to the hovered time and captures the frame.
 *
 * This is the fallback path. When a post ships VTT sprite sheets,
 * `use-preview-thumbnails.ts` serves them instead — cheaper, and the only
 * option for HLS, where a cross-origin frame can't be read back off a canvas.
 */
export function useFrameThumbnails(videoUrl?: string | null) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const seekingRef = useRef(false);
    const targetRef = useRef(0);
    const [thumbDataUrl, setThumbDataUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!videoUrl || videoUrl.includes(".m3u8")) return; // HLS: skip (no cross-origin frame capture)

        const v = document.createElement("video");
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.preload = "metadata";
        v.src = videoUrl;
        videoRef.current = v;

        const c = document.createElement("canvas");
        c.width = 160;
        c.height = 90;
        canvasRef.current = c;

        const onSeeked = () => {
            const ctx = c.getContext("2d");
            if (ctx) {
                ctx.drawImage(v, 0, 0, 160, 90);
                setThumbDataUrl(c.toDataURL("image/jpeg", 0.75));
            }
            seekingRef.current = false;
            // If hover moved while seek was in flight, seek again to latest target
            if (Math.abs(targetRef.current - v.currentTime) > 0.5) {
                v.currentTime = targetRef.current;
                seekingRef.current = true;
            }
        };
        v.addEventListener("seeked", onSeeked);

        return () => {
            v.removeEventListener("seeked", onSeeked);
            v.src = "";
            videoRef.current = null;
            canvasRef.current = null;
            seekingRef.current = false;
            setThumbDataUrl(null);
        };
    }, [videoUrl]);

    const seekThumb = useCallback((time: number) => {
        targetRef.current = time;
        const v = videoRef.current;
        if (!v || seekingRef.current) return;
        v.currentTime = time;
        seekingRef.current = true;
    }, []);

    return { thumbDataUrl, seekThumb };
}
