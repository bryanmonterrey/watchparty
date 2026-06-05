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

        // Portrait-optimized halo for 9:16 aspect ratio.
        // Reduced blur and scale to prevent excessive side bleed.
        glowRef.current = new AmbientGlow(videoEl, {
            blur: 120,
            opacity: 0.5,
            brightness: 1.1,
            saturate: 1.2,
            scale: 1.05,
            downscale: 0.1,
            updateInterval: 98,
            responsiveness: 0.1,
        });

        return () => {
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
