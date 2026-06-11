"use client";

import { useRef, useEffect } from "react";
import { AmbientGlow } from "video-ambient-glow";

interface AmbientGlowVideoProps {
    src?: string | undefined;
    className?: string;
    isActive: boolean;
    videoRef?: React.RefObject<HTMLVideoElement | null>;
    onClick?: () => void;
    loop?: boolean;
    muted?: boolean;
    playsInline?: boolean;
}

export function AmbientGlowVideo({
    src,
    className,
    isActive,
    videoRef: externalVideoRef,
    onClick,
    loop = true,
    muted = false,
    playsInline = true,
}: AmbientGlowVideoProps) {
    const internalRef = useRef<HTMLVideoElement>(null);
    const videoRef = externalVideoRef ?? internalRef;
    const glowRef = useRef<AmbientGlow | null>(null);

    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl) return;

        // Full-page ambient halo. The library sizes the glow canvas to
        // videoRect × scale, centered on the video; fitGlow drives `scale`
        // from the live video rect so the canvas always covers the viewport
        // (overflow is clipped by the shorts scroll container = full page).
        glowRef.current = new AmbientGlow(videoEl, {
            blur: 140,
            opacity: 0.5,
            brightness: 1.1,
            saturate: 1.2,
            scale: 2.5,
            downscale: 0.1,
            updateInterval: 98,
            responsiveness: 0.1,
        });

        const fitGlow = () => {
            const v = videoRef.current;
            const g = glowRef.current;
            if (!v || !g) return;
            const r = v.getBoundingClientRect();
            if (!r.width || !r.height) return;
            // Cover both axes (videoRect × scale ≥ viewport), +10% bleed so the
            // soft edge sits off-screen rather than at the page boundary.
            const scale = Math.max(window.innerWidth / r.width, window.innerHeight / r.height) * 1.1;
            g.updateOptions({ scale });
        };

        // Fit once after first layout, then on metadata/resize. rAF defers past
        // the initial 0-size rect before the video has measured.
        const raf = requestAnimationFrame(fitGlow);
        videoEl.addEventListener("loadedmetadata", fitGlow);
        window.addEventListener("resize", fitGlow);

        return () => {
            cancelAnimationFrame(raf);
            videoEl.removeEventListener("loadedmetadata", fitGlow);
            window.removeEventListener("resize", fitGlow);
            glowRef.current?.destroy();
            glowRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl) return;
        if (isActive) {
            // play() rejects with AbortError when the video is paused (e.g. you
            // navigate to another short) before the play promise resolves — that's
            // benign and expected, so only surface real errors.
            videoEl.play().catch((err: unknown) => {
                if (err instanceof Error && err.name === "AbortError") return;
                console.error(err);
            });
        } else {
            videoEl.pause();
            videoEl.currentTime = 0;
        }
    }, [isActive, videoRef]);

    return (
        <video
            ref={videoRef}
            src={src ?? undefined}
            className={className}
            loop={loop}
            muted={muted}
            playsInline={playsInline}
            onClick={onClick}
            // Required for canvas.drawImage() to work on cross-origin video URLs.
            // Without this the browser throws a SecurityError and glow never renders.
            crossOrigin="anonymous"
        />
    );
}
