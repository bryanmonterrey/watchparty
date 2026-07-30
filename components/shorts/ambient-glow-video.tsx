"use client";

import { useRef, useEffect } from "react";
import { useAmbientGlow, AMBIENT_PRESET } from "@/hooks/use-ambient-glow";

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

    // The app's shared glow, same as home's hero, the watch page and the live
    // player. This ran its own blur 120 / opacity 0.5 / scale 1.05 — a wide
    // haze bleeding onto the page rather than the tight halo everywhere else,
    // which is exactly the drift the preset exists to prevent. Going through
    // the hook means a future tuning reaches shorts too.
    useAmbientGlow(videoRef, AMBIENT_PRESET);

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
