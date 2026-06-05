"use client";

import React, { useRef } from "react";
import { ThumbnailHover } from "./thumbnail-hover";
import type { VttThumb } from "./use-preview-thumbnails";
import type { Chapter, ProgressDot, Marker } from "./types";

interface ScrubberProps {
    timelineRef: React.RefObject<HTMLDivElement | null>;
    hoverPercent: number | null;
    setHoverPercent: (v: number | null) => void;
    isScrubbing: boolean;
    isScrubbingRef: React.RefObject<boolean>;
    _fineScrubProgress?: number;      // 0–1, reserved for heat-map animation
    isDraggingFineScrub: boolean;    // disables heat-map CSS transition during drag
    onFineScrubProgress: (progress: number, isDragging: boolean) => void;
    rainbow?: boolean;
    heatmapBuckets: number[];        // normalized 0–1 per 5s bucket, from DB
    currentTime: number;
    duration: number;
    buffered: number;
    thumbDataUrl: string | null;
    vttThumb?: VttThumb | null;
    thumbnailUrl?: string | null;
    chapters: Chapter[];
    progressDots: ProgressDot[];
    markers?: Marker[];
    isWaiting?: boolean;
    seekThumb: (time: number) => void;
    wasPausedRef: React.RefObject<boolean>;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    setCurrentTime: (t: number) => void;
    setIsScrubbing: (v: boolean) => void;
    formatTime: (s: number) => string;
    getChapterAtTime: (t: number) => Chapter | undefined;
}

// Build an SVG filled-area path from normalized bucket values.
// viewBox is 0 0 100 100; baseline is y=100, peaks go toward y=0.
function buildHeatmapPath(buckets: number[]): string {
    if (buckets.length < 2) return "";
    const n = buckets.length;
    const pts = buckets.map((v, i) => [
        (i / (n - 1)) * 100,
        100 - v * 100,
    ]);
    const d = [`M 0 100`, `L ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`];
    for (let i = 1; i < pts.length; i++) {
        d.push(`L ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`);
    }
    d.push("L 100 100 Z");
    return d.join(" ");
}

// Pixels of upward drag to fully open the fine-scrub strip (matches YouTube ~34px)
const FINE_SCRUB_FULL_DRAG = 34;
// Fine-scrub sensitivity: seconds per pixel of horizontal movement
const FINE_SCRUB_SENSITIVITY = 0.3;

export function Scrubber({
    timelineRef,
    hoverPercent,
    setHoverPercent,
    isScrubbing,
    isScrubbingRef,
    isDraggingFineScrub,
    onFineScrubProgress,
    rainbow = false,
    heatmapBuckets,
    currentTime,
    duration,
    buffered,
    thumbDataUrl,
    vttThumb,
    thumbnailUrl,
    chapters,
    progressDots,
    markers = [],
    isWaiting = false,
    seekThumb,
    wasPausedRef,
    videoRef,
    setCurrentTime,
    setIsScrubbing,
    formatTime,
    getChapterAtTime,
}: ScrubberProps) {
    const hoverTime = hoverPercent !== null ? hoverPercent * duration : 0;
    const hoverChapter = hoverPercent !== null ? getChapterAtTime(hoverTime) : undefined;

    const dragStartYRef = useRef<number>(0);
    const dragStartXRef = useRef<number>(0);
    const dragStartTimeRef = useRef<number>(0);
    const isFineScrubRef = useRef(false);
    const liveDragProgressRef = useRef(0);

    // Stable ref so the document-level closures always call the latest callback,
    // regardless of Turbopack HMR or stale closure captures.
    const onFineScrubProgressRef = useRef(onFineScrubProgress);
    onFineScrubProgressRef.current = onFineScrubProgress;

    const heatmapPath = buildHeatmapPath(heatmapBuckets);

    return (
        <div
            ref={timelineRef}
            className="relative w-full cursor-pointer select-none"
            style={{ height: 16, display: "flex", alignItems: "center" }}
            onMouseMove={(e) => {
                if (isScrubbingRef.current) return;
                const rect = timelineRef.current?.getBoundingClientRect();
                if (!rect) return;
                const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                setHoverPercent(pct);
                seekThumb(pct * duration);
            }}
            onMouseLeave={() => { if (!isScrubbingRef.current) setHoverPercent(null); }}
            onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                const rect = timelineRef.current?.getBoundingClientRect();
                if (!rect) return;
                const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));

                wasPausedRef.current = videoRef.current?.paused ?? true;
                videoRef.current?.pause();
                isScrubbingRef.current = true;
                setIsScrubbing(true);
                setHoverPercent(pct);

                const t = pct * (videoRef.current?.duration || 0);
                setCurrentTime(t);
                if (videoRef.current) videoRef.current.currentTime = t;
                seekThumb(t);

                dragStartYRef.current = e.clientY;
                dragStartXRef.current = e.clientX;
                dragStartTimeRef.current = t;
                isFineScrubRef.current = false;
                liveDragProgressRef.current = 0;

                const onMove = (ev: PointerEvent) => {
                    const deltaY = dragStartYRef.current - ev.clientY; // positive = dragged up
                    const progress = Math.min(1, Math.max(0, deltaY / FINE_SCRUB_FULL_DRAG));
                    liveDragProgressRef.current = progress;

                    // Push live progress to controls-bar for proportional animation
                    if (typeof onFineScrubProgressRef.current === "function") {
                        onFineScrubProgressRef.current(progress, true);
                    }

                    if (!isFineScrubRef.current && progress >= 1) {
                        // Crossed the threshold — lock into horizontal fine-scrub mode
                        isFineScrubRef.current = true;
                        dragStartXRef.current = ev.clientX;
                        dragStartTimeRef.current = videoRef.current?.currentTime ?? 0;
                    }

                    if (isFineScrubRef.current) {
                        // Horizontal movement scrubs video time
                        const deltaX = ev.clientX - dragStartXRef.current;
                        const newTime = Math.max(0, Math.min(duration, dragStartTimeRef.current + deltaX * FINE_SCRUB_SENSITIVITY));
                        if (videoRef.current) videoRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                        seekThumb(newTime);
                    } else {
                        // Normal scrub — follow X across the bar
                        const r = timelineRef.current?.getBoundingClientRect();
                        if (!r) return;
                        const p = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
                        const newT = p * (videoRef.current?.duration || 0);
                        if (videoRef.current) videoRef.current.currentTime = newT;
                        setCurrentTime(newT);
                        setHoverPercent(p);
                        seekThumb(newT);
                    }
                };

                const onUp = () => {
                    isScrubbingRef.current = false;
                    setIsScrubbing(false);
                    setHoverPercent(null);

                    const wasFineScrubbing = isFineScrubRef.current;
                    isFineScrubRef.current = false;

                    const finalProgress = liveDragProgressRef.current;
                    liveDragProgressRef.current = 0;

                    // Snap: if dragged past halfway (or already in horizontal mode), open the strip
                    const snapOpen = wasFineScrubbing || finalProgress >= 0.5;
                    if (typeof onFineScrubProgressRef.current === "function") {
                        onFineScrubProgressRef.current(snapOpen ? 1 : 0, false);
                    }

                    if (!snapOpen && !wasPausedRef.current && videoRef.current) {
                        void videoRef.current.play();
                    }
                    // If snapOpen, leave strip open — user closes via play or dismiss button

                    document.removeEventListener("pointermove", onMove);
                    document.removeEventListener("pointerup", onUp);
                };

                document.addEventListener("pointermove", onMove);
                document.addEventListener("pointerup", onUp);
            }}
        >
            {/* ytp-heat-map-container */}
            <div
                className="absolute inset-x-0 pointer-events-none overflow-hidden"
                style={{
                    height: 40,
                    bottom: "50%",
                    marginBottom: 2,
                    opacity: hoverPercent !== null ? 1 : 0,
                    transition: isDraggingFineScrub
                        ? "opacity 0.2s cubic-bezier(0.05, 0, 0, 1) 0.1s"
                        : "opacity 0.2s cubic-bezier(0.05, 0, 0, 1) 0.1s, transform 0.2s cubic-bezier(0.05, 0, 0, 1)",
                }}
            >
                <svg
                    className="w-full h-full"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 100"
                    style={{ opacity: 0.35 }}
                >
                    <defs>
                        <linearGradient id="heatmap-grad" x1="0%" x2="0%" y1="0%" y2="100%">
                            <stop offset="0%" stopColor="white" stopOpacity="1" />
                            <stop offset="100%" stopColor="white" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    {heatmapPath
                        ? <path fill="url(#heatmap-grad)" d={heatmapPath} />
                        : <rect fill="url(#heatmap-grad)" height="30%" width="100%" x="0" y="70%" />
                    }
                </svg>
            </div>

            {/* Thumbnail preview above cursor */}
            {hoverPercent !== null && !isScrubbing && (vttThumb || thumbDataUrl || thumbnailUrl) && (
                <ThumbnailHover
                    src={thumbDataUrl ?? thumbnailUrl ?? null}
                    vttThumb={vttThumb}
                    time={hoverTime}
                    chapterTitle={hoverChapter?.title}
                    formatTime={formatTime}
                    leftPercent={Math.min(Math.max(hoverPercent, 0.05), 0.95) * 100}
                />
            )}

            {/* Track layers */}
            <div
                className="absolute inset-x-0 rounded-full overflow-hidden transition-[height] duration-150"
                style={{ height: hoverPercent !== null ? 5 : 3 }}
            >
                <div className="absolute inset-0 bg-black/40" />
                <div
                    className={`absolute inset-y-0 left-0 w-full ${rainbow ? "bg-white/30" : "bg-white/50"}`}
                    style={{
                        transform: `scaleX(${duration ? buffered / duration : 0})`,
                        transformOrigin: "left",
                    }}
                />
                {hoverPercent !== null && (
                    <div
                        className={rainbow ? "absolute inset-y-0 left-0 w-full" : "absolute inset-y-0 left-0 w-full bg-twitter2/50"}
                        style={{
                            transform: `scaleX(${hoverPercent})`,
                            transformOrigin: "left",
                            transition: "opacity 0.25s cubic-bezier(0, 0, 0.2, 1)",
                            ...(rainbow ? {
                                opacity: 0.4,
                                background: "linear-gradient(270deg,#efa59e 0%,#f5ccd1 8.3%,#f7ceb3 16.6%,#eccfa5 25%,#b9d8ae 33.3%,#97d6e3 41.6%,#9fb1e8 50%,#97d6e3 58.3%,#b9d8ae 66.6%,#eccfa5 75%,#f7ceb3 83.3%,#f5ccd1 91.6%,#efa59e 100%)",
                                backgroundSize: "200% 100%",
                            } : {}),
                        }}
                    />
                )}
                {/* Progress fill — rainbow or brand green */}
                <div
                    className={rainbow ? "absolute inset-y-0 left-0 w-full" : "absolute inset-y-0 left-0 w-full bg-twitter2"}
                    style={{
                        transform: `scaleX(${duration ? currentTime / duration : 0})`,
                        transformOrigin: "left",
                        transition: isScrubbing ? "none" : "transform 0.25s linear",
                        ...(rainbow ? {
                            background: "linear-gradient(270deg,#efa59e 0%,#f5ccd1 8.3%,#f7ceb3 16.6%,#eccfa5 25%,#b9d8ae 33.3%,#97d6e3 41.6%,#9fb1e8 50%,#97d6e3 58.3%,#b9d8ae 66.6%,#eccfa5 75%,#f7ceb3 83.3%,#f5ccd1 91.6%,#efa59e 100%)",
                            backgroundSize: "200% 100%",
                            animation: "scrubber-rainbow 2500ms linear infinite",
                        } : {}),
                    }}
                />
                {/* Loading stripe */}
                {isWaiting && (
                    <div
                        className="absolute inset-y-0 left-0 pointer-events-none"
                        style={{
                            width: `${duration ? (buffered / duration) * 100 : 100}%`,
                            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
                            backgroundSize: "200% 100%",
                            animation: "scrubber-shimmer 1.2s ease-in-out infinite",
                        }}
                    />
                )}
            </div>

            {/* Thumb dot */}
            <div
                className={`absolute w-3 h-3 rounded-full shadow-md pointer-events-none ${rainbow ? "bg-white" : "bg-twitter2"}`}
                style={{
                    left: `${duration ? (currentTime / duration) * 100 : 0}%`,
                    top: "50%",
                    transform: `translate(-50%, -50%) scale(${hoverPercent !== null ? 1.67 : 1})`,
                    transition: isScrubbing
                        ? "transform 0.2s cubic-bezier(0.05, 0, 0, 1)"
                        : "transform 0.2s cubic-bezier(0.05, 0, 0, 1), left 0.25s linear",
                }}
            />

            {/* Chapter markers */}
            {chapters.map((ch, i) => (
                <div
                    key={i}
                    className="absolute inset-y-0 w-[2px] bg-white/60 pointer-events-none"
                    style={{ left: `${(ch.startTime / (duration || 1)) * 100}%` }}
                />
            ))}

            {/* Markers — 1px lines, show label on hover, click to seek */}
            {markers.map((m, i) => (
                <div
                    key={i}
                    className="absolute group/marker cursor-pointer"
                    style={{
                        left: `${(m.time / (duration || 1)) * 100}%`,
                        top: 0,
                        bottom: 0,
                        width: 10,
                        transform: "translateX(-50%)",
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        const video = videoRef.current;
                        if (!video) return;
                        video.currentTime = m.time;
                        setCurrentTime(m.time);
                        seekThumb(m.time);
                    }}
                >
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-yellow-400/80 pointer-events-none" />
                    {m.label && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/80 text-white text-[11px] px-2 py-0.5 rounded-md pointer-events-none opacity-0 group-hover/marker:opacity-100 transition-opacity duration-150">
                            {m.label}
                        </div>
                    )}
                </div>
            ))}

            {/* Progress dots */}
            {progressDots.map((dot, i) => (
                <div
                    key={i}
                    title={dot.label}
                    className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none ${rainbow ? "bg-white/80 border-2 border-white/40" : "bg-twitter2 border-2 border-white"}`}
                    style={{ left: `calc(${(dot.time / (duration || 1)) * 100}% - 4px)` }}
                />
            ))}
        </div>
    );
}
