"use client";

import { useRef, useState } from "react";
import { YTPlayIcon, YTPauseIcon } from "@/components/icons";

interface MiniPlayerOverlayProps {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    bufferedFraction: number;
    thumbDataUrl?: string | null;
    thumbnailUrl?: string | null;
    formatTime: (s: number) => string;
    onTogglePlay: () => void;
    onSeek: (fraction: number) => void;
    onScrubHover?: (time: number) => void;
    onClose?: () => void;
    onExpand?: () => void;
}

export function MiniPlayerOverlay({
    isPlaying,
    currentTime,
    duration,
    bufferedFraction,
    thumbDataUrl,
    thumbnailUrl,
    formatTime,
    onTogglePlay,
    onSeek,
    onScrubHover,
    onClose,
    onExpand,
}: MiniPlayerOverlayProps) {
    const progress = duration ? (currentTime / duration) * 100 : 0;
    const bufferedPct = bufferedFraction * 100;

    const scrubberRef = useRef<HTMLDivElement>(null);
    const [scrubHover, setScrubHover] = useState<number | null>(null);
    const isScrubbingRef = useRef(false);
    const [isScrubbing, setIsScrubbing] = useState(false);

    const getScrubFraction = (clientX: number) => {
        const rect = scrubberRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    return (
        <div className="absolute inset-0 z-[30] group/mini select-none">

            {/* Scrim — hover only */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/mini:opacity-100 transition-opacity duration-200 pointer-events-none" />

            {/* Top row: expand (left) + close (right) — hover only */}
            <div className="absolute inset-x-0 top-0 flex justify-between items-center px-1 pt-1 z-10 opacity-0 group-hover/mini:opacity-100 transition-opacity duration-200 cursor-grab">
                <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={onExpand}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors text-white cursor-pointer"
                >
                    <svg height="24" viewBox="0 0 24 24" width="24">
                        <path d="M21.20 3.01C21.69 3.06 22.15 3.29 22.48 3.65C22.81 4.02 23.00 4.50 23 5V11H21V5H3V19H13V21H3L2.79 20.99C2.33 20.94 1.91 20.73 1.58 20.41C1.26 20.08 1.05 19.66 1.01 19.20L1 19V5C0.99 4.50 1.18 4.02 1.51 3.65C1.84 3.29 2.30 3.06 2.79 3.01L3 3H21L21.20 3.01ZM12.10 6.00L12 6H5L4.89 6.00C4.65 6.03 4.42 6.14 4.25 6.33C4.09 6.51 3.99 6.75 4 7V12L4.00 12.10C4.02 12.33 4.12 12.54 4.29 12.70C4.45 12.86 4.66 12.97 4.89 12.99L5 13H12L12.10 12.99C12.33 12.97 12.54 12.87 12.70 12.70C12.87 12.54 12.97 12.33 12.99 12.10L13 12V7C13.00 6.75 12.90 6.51 12.74 6.32C12.57 6.14 12.34 6.03 12.10 6.00ZM6 11V8H11V11H6ZM21 13H15V19C15 19.26 15.10 19.51 15.29 19.70C15.48 19.89 15.73 20 16 20C16.26 20 16.51 19.89 16.70 19.70C16.89 19.51 17 19.26 17 19V16.41L21.29 20.70C21.38 20.80 21.49 20.87 21.61 20.93C21.73 20.98 21.87 21.01 22.00 21.01C22.13 21.01 22.26 20.98 22.39 20.93C22.51 20.88 22.62 20.81 22.71 20.71C22.81 20.62 22.88 20.51 22.93 20.39C22.98 20.26 23.01 20.13 23.01 20.00C23.01 19.87 22.98 19.73 22.93 19.61C22.87 19.49 22.80 19.38 22.70 19.29L18.41 15H21C21.26 15 21.51 14.89 21.70 14.70C21.89 14.51 22 14.26 22 14C22 13.73 21.89 13.48 21.70 13.29C21.51 13.10 21.26 13 21 13Z" fill="currentColor" />
                    </svg>
                </button>
                <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={onClose}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors text-white cursor-pointer"
                >
                    <svg height="24" viewBox="0 0 24 24" width="24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
                    </svg>
                </button>
            </div>

            {/* Center: play/pause — hover only. Outer area is pointer-events-none so it stays
                draggable; only the icon itself captures pointer events. */}
            <div className="absolute inset-x-0 top-0 bottom-10 flex items-center justify-center z-[5] opacity-0 group-hover/mini:opacity-100 transition-opacity duration-200 pointer-events-none">
                <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={onTogglePlay}
                    className="pointer-events-auto text-white cursor-pointer p-3 rounded-full hover:bg-white/10 transition-colors"
                >
                    {isPlaying ? <YTPauseIcon className="size-12" /> : <YTPlayIcon className="size-12" />}
                </button>
            </div>

            {/* Bottom: time + thumbnail + scrubber */}
            <div className="absolute inset-x-0 bottom-0 z-10">

                {/* Time — hover only */}
                <div className="px-3 pb-1 opacity-0 group-hover/mini:opacity-100 transition-opacity duration-200 pointer-events-none">
                    <span className="text-white text-sm font-medium tabular-nums drop-shadow">
                        {formatTime(currentTime)}
                        <span className="text-white/60"> / {formatTime(duration)}</span>
                    </span>
                </div>

                {/* Thumbnail preview above scrubber */}
                {scrubHover !== null && (thumbDataUrl || thumbnailUrl) && (
                    <div
                        className="absolute bottom-[20px] -translate-x-1/2 pointer-events-none"
                        style={{ left: `${Math.max(8, Math.min(92, scrubHover * 100))}%` }}
                    >
                        <img
                            src={thumbDataUrl ?? thumbnailUrl ?? ""}
                            className="h-[60px] aspect-video rounded border border-white/30 object-cover shadow-xl"
                            alt=""
                        />
                        <div className="text-white text-[10px] text-center mt-0.5 tabular-nums drop-shadow">
                            {formatTime(scrubHover * duration)}
                        </div>
                    </div>
                )}

                {/* Scrubber */}
                <div
                    ref={scrubberRef}
                    className="relative cursor-pointer"
                    style={{ height: 20 }}
                    onMouseMove={(e) => {
                        const frac = getScrubFraction(e.clientX);
                        setScrubHover(frac);
                        onScrubHover?.(frac * duration);
                    }}
                    onMouseLeave={() => { if (!isScrubbingRef.current) setScrubHover(null); }}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        const frac = getScrubFraction(e.clientX);
                        onSeek(frac);
                        isScrubbingRef.current = true;
                        setIsScrubbing(true);
                        setScrubHover(frac);
                        onScrubHover?.(frac * duration);

                        const onMove = (ev: PointerEvent) => {
                            const f = getScrubFraction(ev.clientX);
                            onSeek(f);
                            setScrubHover(f);
                            onScrubHover?.(f * duration);
                        };
                        const onUp = () => {
                            isScrubbingRef.current = false;
                            setIsScrubbing(false);
                            setScrubHover(null);
                            document.removeEventListener("pointermove", onMove);
                            document.removeEventListener("pointerup", onUp);
                        };
                        document.addEventListener("pointermove", onMove);
                        document.addEventListener("pointerup", onUp);
                    }}
                >
                    {/* 3-layer track: background / buffered / progress — centered vertically */}
                    <div
                        className="absolute inset-x-0 overflow-hidden rounded-full transition-[height] duration-150 ease-linear"
                        style={{
                            height: scrubHover !== null ? 4 : 2,
                            top: "50%",
                            transform: "translateY(-50%)",
                        }}
                    >
                        <div className="absolute inset-0 bg-white/30" />
                        <div className="absolute inset-y-0 left-0 bg-white/50" style={{ width: `${bufferedPct}%` }} />
                        <div
                            className="absolute inset-y-0 left-0 bg-[#f00]"
                            style={{
                                width: `${progress}%`,
                                transition: isScrubbing ? "none" : "width 0.25s linear",
                            }}
                        />
                    </div>

                    {/* Circle handle — always visible, smooth left + scale transition */}
                    <div
                        className="absolute w-3 h-3 bg-[#f00] rounded-full shadow pointer-events-none"
                        style={{
                            left: `${progress}%`,
                            top: "50%",
                            transform: `translate(-50%, -50%) scale(${scrubHover !== null ? 1.4 : 1})`,
                            transition: isScrubbing
                                ? "transform 150ms linear"
                                : "transform 150ms linear, left 0.25s linear",
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
