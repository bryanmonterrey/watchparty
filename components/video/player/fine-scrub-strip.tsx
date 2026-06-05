"use client";

import { useRef, useEffect } from "react";

interface FineScrubStripProps {
    isActive: boolean;
    currentTime: number;
    duration: number;
    thumbDataUrl: string | null;
    thumbnailUrl?: string | null;
    onScrub: (time: number) => void;
}

const TILE_W = 160;
const TILE_H = 90;

export const STRIP_H = TILE_H;

export function FineScrubStrip({
    isActive,
    currentTime,
    duration,
    thumbDataUrl,
    thumbnailUrl,
    onScrub,
}: FineScrubStripProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const src = thumbDataUrl ?? thumbnailUrl ?? null;

    const numTiles = Math.max(20, Math.ceil(duration / 5));
    const totalW = numTiles * TILE_W;
    const currentPx = duration > 0 ? (currentTime / duration) * totalW : 0;

    const halfW = useRef(360);
    useEffect(() => {
        if (containerRef.current) halfW.current = containerRef.current.offsetWidth / 2;
    }, [isActive]);

    // translateX centers currentPx under the cursor line.
    // At time=0: translateX=halfW → left edge of first tile sits at center. ✓
    const translateX = -(currentPx - halfW.current);

    const isDraggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartTimeRef = useRef(0);
    const onScrubRef = useRef(onScrub);
    onScrubRef.current = onScrub;

    return (
        <div
            className="absolute inset-0 rounded-b-3xl overflow-hidden"
            style={{ pointerEvents: isActive ? "auto" : "none" }}
        >
            {/* Scrolling filmstrip */}
            <div ref={containerRef} className="absolute inset-0 overflow-hidden">
                <div
                    ref={stripRef}
                    className="flex h-full"
                    style={{
                        transform: `translateX(${translateX}px)`,
                        transition: "transform 0s",
                        touchAction: "none",
                        willChange: "transform",
                        cursor: isActive ? "grab" : "default",
                    }}
                    onPointerDown={(e) => {
                        if (!isActive) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        isDraggingRef.current = true;
                        dragStartXRef.current = e.clientX;
                        dragStartTimeRef.current = currentTime;
                        if (stripRef.current) stripRef.current.style.cursor = "grabbing";
                    }}
                    onPointerMove={(e) => {
                        if (!isDraggingRef.current) return;
                        const deltaX = e.clientX - dragStartXRef.current;
                        // Drag left → time increases; drag right → time decreases
                        const secondsPerPixel = totalW > 0 ? duration / totalW : 0;
                        const newTime = Math.max(0, Math.min(duration, dragStartTimeRef.current - deltaX * secondsPerPixel));
                        onScrubRef.current(newTime);
                    }}
                    onPointerUp={(e) => {
                        isDraggingRef.current = false;
                        if (stripRef.current) stripRef.current.style.cursor = isActive ? "grab" : "default";
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onPointerCancel={(e) => {
                        isDraggingRef.current = false;
                        if (stripRef.current) stripRef.current.style.cursor = isActive ? "grab" : "default";
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                >
                    <div
                        className="relative flex h-full"
                        role="slider"
                        aria-label="Drag to seek precisely."
                        aria-valuemin={0}
                        aria-valuemax={Math.round(duration)}
                        aria-valuenow={Math.round(currentTime)}
                        tabIndex={-1}
                    >
                        {Array.from({ length: numTiles }).map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    width: TILE_W,
                                    height: TILE_H,
                                    flexShrink: 0,
                                    backgroundImage: src ? `url(${src})` : undefined,
                                    backgroundColor: "#111",
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                    filter: Math.abs(i - Math.round(currentPx / TILE_W)) <= 1
                                        ? "brightness(1)"
                                        : "brightness(0.7)",
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Top gradient vignette */}
            <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-8 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)", zIndex: 1 }}
            />

            {/* Center cursor line */}
            <div
                aria-hidden="true"
                className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-[2px] bg-white pointer-events-none"
                style={{ zIndex: 2 }}
            />
        </div>
    );
}
