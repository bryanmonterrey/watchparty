"use client";

import { useRef, useCallback, useState } from "react";
import { motion } from "motion/react";
import { InfoIcon, UndoIcon, RedoIcon, ShortsIcon, SearchMinusIcon, SearchPlusIcon, MusicIcon, CreateIcon } from "@/components/icons";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { DraftCard, CardType } from "./types";
import { CARD_TYPE_LABELS } from "./types";

// ── Filmstrip video track ─────────────────────────────────────────────────────

function VideoTrackStrip({
    thumbnailUrl,
    currentTime,
    duration,
    onSeek,
}: {
    thumbnailUrl?: string | null;
    currentTime: number;
    duration: number;
    onSeek: (t: number) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const dragStartX = useRef(0);
    const dragStartTime = useRef(0);
    const onSeekRef = useRef(onSeek);
    onSeekRef.current = onSeek;

    const numTiles = Math.max(12, Math.ceil(duration / 5));

    return (
        <div
            ref={containerRef}
            className="flex-1 relative flex overflow-hidden z-20 cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect || duration === 0) return;
                isDragging.current = true;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const t = pct * duration;
                onSeekRef.current(t);
                dragStartX.current = e.clientX;
                dragStartTime.current = t;
            }}
            onPointerMove={(e) => {
                if (!isDragging.current) return;
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect || duration === 0) return;
                const deltaX = e.clientX - dragStartX.current;
                const newTime = Math.max(0, Math.min(duration, dragStartTime.current + (deltaX / rect.width) * duration));
                onSeekRef.current(newTime);
            }}
            onPointerUp={(e) => {
                isDragging.current = false;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={(e) => {
                isDragging.current = false;
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }}
        >
            {/* One tile per segment — mirrors fine-scrub-strip approach */}
            {Array.from({ length: numTiles }).map((_, i) => (
                <div
                    key={i}
                    className="flex-1 h-full border-r border-black/40 flex-shrink-0"
                    style={{
                        backgroundImage: thumbnailUrl ? `url(${thumbnailUrl})` : undefined,
                        backgroundColor: "#1c1c1e",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
            ))}
        </div>
    );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

interface CardsTimelineProps {
    cards: DraftCard[];
    currentTime: number;
    duration: number;
    thumbnailUrl?: string | null;
    onSeek: (time: number) => void;
    onCardSeek: (cardId: string, time: number) => void;
    onCardSeekCommit?: (cardId: string) => void;
    onAddCard?: (startTime: number, type: CardType) => string;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}

function formatTime(s: number): string {
    if (isNaN(s) || s === 0) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const RULER_TICKS = [0, 0.25, 0.5, 0.75, 1];

export function CardsTimeline({
    cards,
    currentTime,
    duration,
    thumbnailUrl,
    onSeek,
    onCardSeek,
    onCardSeekCommit,
    onAddCard,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
}: CardsTimelineProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(1);
    const [addPopoverOpen, setAddPopoverOpen] = useState(false);
    const [hoverFraction, setHoverFraction] = useState<number | null>(null);

    const handleTracksMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect || duration === 0) { setHoverFraction(null); return; }
        if (e.clientX < rect.left || e.clientX > rect.right) { setHoverFraction(null); return; }
        setHoverFraction(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    }, [duration]);

    const toPercent = (t: number) => duration > 0 ? (t / duration) * 100 : 0;

    const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect || duration === 0) return;
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        onSeek(pct * duration);
    }, [duration, onSeek]);

    const handleMarkerDrag = useCallback((cardId: string, startTime: number, e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const startX = e.clientX;
        const rect = trackRef.current?.getBoundingClientRect();
        let dragged = false;
        const move = (ev: MouseEvent) => {
            if (Math.abs(ev.clientX - startX) > 3) dragged = true;
            if (!dragged || !rect || duration === 0) return;
            const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
            onCardSeek(cardId, Math.round(pct * duration));
        };
        const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            if (!dragged) onSeek(startTime);
            else onCardSeekCommit?.(cardId);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    }, [duration, onCardSeek, onCardSeekCommit, onSeek]);

    const handlePlayheadDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect || duration === 0) return;
        const move = (ev: MouseEvent) => {
            const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
            onSeek(pct * duration);
        };
        const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    }, [duration, onSeek]);

    const trackScale = `${zoom * 100}%`;

    return (
        <div className="flex-shrink-0 flex flex-col bg-black select-none">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 pt-2 pb-4">
                <div className="flex items-center gap-3">
                    <div className="px-3 py-1.5 bg-zinc-900/60 rounded-lg text-sm font-medium text-zinc-300 border border-flexborder/40">
                        {formatTime(currentTime)}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            className="flex items-center bg-white/15 disabled:bg-white/15 gap-2 px-4 py-2 text-md font-bold text-zinc-400 hover:text-white hover:bg-white/8 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={!canUndo}
                            onClick={onUndo}
                        >
                            <UndoIcon className="size-5" /> Undo
                        </button>
                        <button
                            className="flex items-center bg-white/15 disabled:bg-white/15 gap-3 px-4 py-2 text-md font-bold text-zinc-400 hover:text-white hover:bg-white/8 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={!canRedo}
                            onClick={onRedo}
                        >
                            <RedoIcon className="size-5" /> Redo
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <SearchMinusIcon className="size-5.5 text-zinc-500" />
                    <div className="w-36 flex items-center">
                        <Slider
                            value={zoom}
                            onChange={(v) => setZoom(v as number)}
                            min={1}
                            max={5}
                            step={0.25}
                            showValue={false}
                            hideFill
                            thumbColor="white"
                            trackClassName="bg-zinc-700/60 border-zinc-600/30"
                        />
                    </div>
                    <SearchPlusIcon className="size-5.5 text-zinc-500" />
                </div>
            </div>

            {/* Scrollable timeline */}
            <div className="overflow-x-auto scrollbar-hide">
                <div style={{ minWidth: trackScale }}>
                    {/* Ruler */}
                    <div className="flex flex-row h-9 border-b border-flexborder/60">
                        <div className="w-28 relative flex-shrink-0 sticky left-0 bg-black z-20" />
                        <div className="px-12 w-full flex">
                        <div className="flex-1 relative">
                            {RULER_TICKS.map((pct) => (
                                <div
                                    key={pct}
                                    className="absolute top-0 flex flex-row gap-1 items-start"
                                    style={{ left: `${pct * 100}%` }}
                                >
                                    <div className="w-px h-9 bg-flexborder/60" />
                                    <span className="text-xs leading-none text-zinc-500 tabular-nums mt-1">
                                        {duration > 0 ? formatTime(duration * pct) : "--:--"}
                                    </span>
                                </div>
                            ))}
                        </div>
                        </div>

                    </div>

                    {/* Tracks */}
                    <div
                        className="flex flex-col relative"
                        onMouseMove={handleTracksMouseMove}
                        onMouseLeave={() => setHoverFraction(null)}
                    >
                        {/* Click-to-seek overlay — covers exactly the content area (after label + px-12 pad) */}
                        <div
                            ref={trackRef}
                            className="absolute top-0 bottom-0 z-10 cursor-crosshair"
                            style={{ left: "160px", right: "48px" }}
                            onClick={handleTrackClick}
                        />

                        {/* Info / Cards track */}
                        <div className="flex h-[52px] border-b border-flexborder/60">
                            <div className="w-28 flex bg-black  items-center border-r border-flexborder/60 text-zinc-500 flex-shrink-0 bg-black z-20 px-3 justify-between sticky left-0">
                                <InfoIcon className="size-5.5" />
                                <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <button className="cursor-pointer text-zinc-500 hover:text-white transition-colors rounded">
                                            <CreateIcon className="size-5.5" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        side="top"
                                        align="end"
                                        sideOffset={8}
                                        className="w-48 bg-neutral-950 border-flexborder/75 rounded-3xl shadow-[0_0_15px_5px_rgba(255,255,255,0.1)] ring ring-white/10 p-1.5 overflow-hidden z-50 flex flex-col gap-1"
                                    >
                                        {(["video", "playlist", "channel", "link"] as CardType[]).map((type) => (
                                            <button
                                                key={type}
                                                className="flex cursor-pointer items-center gap-3 w-full px-4 py-2.5 text-base font-bold text-zinc-200 hover:bg-white/5 hover:text-white rounded-full transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                                                disabled={type === "link"}
                                                onClick={() => {
                                                    onAddCard?.(Math.floor(currentTime), type);
                                                    setAddPopoverOpen(false);
                                                }}
                                            >
                                                <CreateIcon className="size-5 text-white flex-shrink-0" />
                                                {CARD_TYPE_LABELS[type]}
                                            </button>
                                        ))}
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="px-12 w-full flex py-2">
                            <div className="flex-1 relative bg-black overflow-hidden">
                                {cards.map(card => (
                                    <motion.div
                                        key={card.id}
                                        className="absolute w-2 h-8 hover:cursor-grab active:cursor-grabbing top-[8px] -translate-x-1/2 bg-white rounded-sm z-20"
                                        style={{ left: `${toPercent(card.startTime)}%` }}
                                        whileHover={{ backgroundColor: "#ffffffff" }}
                                        transition={{ duration: 0.1 }}
                                        onMouseDown={e => handleMarkerDrag(card.id, card.startTime, e)}
                                    />
                                ))}
                            </div>
                            </div>
                        </div>

                        {/* Video track — draggable filmstrip */}
                        <div className="flex h-[52px] border-b border-flexborder/60">
                            <div className="w-28 flex bg-black z-200 items-center px-3 border-r border-flexborder/60 text-zinc-500 flex-shrink-0 bg-black z-20 sticky left-0">
                                <ShortsIcon className="size-5.5" />
                            </div>
                            <div className="px-12 w-full flex py-2">
                            
                            <VideoTrackStrip
                                thumbnailUrl={thumbnailUrl}
                                currentTime={currentTime}
                                duration={duration}
                                onSeek={onSeek}
                            />
                            </div>
                        </div>

                        {/* Audio track */}
                        <div className="flex h-[52px] border-b border-flexborder/60">
                            <div className="w-28 flex bg-black items-center px-3 border-r border-flexborder/60 text-zinc-500 flex-shrink-0 bg-black z-20 sticky left-0">
                                <MusicIcon className="size-5.5" />
                            </div>
                            <div className="px-12 w-full flex py-2">
                            <div className="flex-1 bg-black relative overflow-hidden flex items-center px-2">
                                <div className="w-full h-full flex items-center gap-[2px] py-2">
                                    {Array.from({ length: 120 }).map((_, i) => {
                                        const h = 20 + Math.sin(i * 0.4) * 10 + Math.sin(i * 1.3) * 8 + Math.sin(i * 2.7) * 5;
                                        return (
                                            <div
                                                key={i}
                                                className="flex-1 bg-zinc-600/60 rounded-full"
                                                style={{ height: `${Math.max(10, Math.min(90, h))}%` }}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                            </div>
                        </div>

                        {/* Hover scrubber — follows cursor, shows time badge */}
                        {hoverFraction !== null && duration > 0 && (
                            <div
                                className="absolute top-0 bottom-0 w-[2px] bg-white/40 z-[25] pointer-events-none"
                                style={{ left: `calc(160px + ${hoverFraction} * (100% - 208px))` }}
                            >
                                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-white text-black text-[11px] font-semibold px-2 py-0.5 rounded-sm whitespace-nowrap shadow-sm">
                                    {formatTime(hoverFraction * duration)}
                                </div>
                            </div>
                        )}

                        {/* Global playhead — spans all 3 tracks */}
                        {duration > 0 && (
                            <div
                                className="absolute top-0 bottom-0 w-[2px] hover:cursor-grab active:cursor-grabbing bg-white z-300"
                                style={{ left: `calc(160px + ${toPercent(currentTime) / 100} * (100% - 208px))` }}
                                onMouseDown={handlePlayheadDrag}
                            >
                                <div
                                    className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 hover:cursor-grab active:cursor-grabbing rounded-full bg-white shadow-lg pointer-events-auto"
                                    onMouseDown={handlePlayheadDrag}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
