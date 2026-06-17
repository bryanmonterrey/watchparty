"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { PlayPauseMorph, VolumeMorph, CaptionsMorph, FullscreenMorph } from "@/components/morph-icons";
import { cn } from "@/lib/utils";

// m:ss, or h:mm:ss past an hour.
function formatTime(seconds: number) {
    const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

interface FeedVideoPlayerProps {
    postId: string;
    videoUrl: string;
    poster?: string | null;
    className?: string;
}

// Compact feed player (discover). Mirrors the full video-page player's control
// language — grouped black/30 pills, morph icons, a 3-layer scrubber with a
// twitter2 playhead — but scaled down with plain local state instead of the
// heavy usePlayer stack (no HLS quality, chapters, ads, PiP, theater, settings
// menu). Controls reveal on hover and stay up while paused.
export function FeedVideoPlayer({ postId, videoUrl, poster, className }: FeedVideoPlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const scrubRef = useRef<HTMLDivElement>(null);

    const [started, setStarted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [captionsOn, setCaptionsOn] = useState(false);
    const [captionText, setCaptionText] = useState("");
    const [scrubHover, setScrubHover] = useState<number | null>(null);
    const isScrubbingRef = useRef(false);

    // Lazy: only fetch caption tracks once the video has actually been played,
    // so an all-video feed doesn't fire a query per card up front.
    const { data: captionsData } = trpc.content.getCaptions.useQuery(
        { postId },
        { enabled: started, staleTime: Infinity },
    );
    const captionTracks = captionsData?.captions ?? [];
    const defaultCaption = Math.max(0, captionTracks.findIndex((c) => c.isDefault));

    const togglePlay = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) { setStarted(true); void v.play().catch(() => {}); }
        else v.pause();
    }, []);

    const toggleMute = () => {
        const v = videoRef.current;
        if (!v) return;
        const next = !v.muted;
        v.muted = next;
        setMuted(next);
        if (!next && v.volume === 0) { v.volume = 1; setVolume(1); }
    };

    const adjustVolume = (val: number) => {
        const v = videoRef.current;
        if (!v) return;
        const clamped = Math.max(0, Math.min(1, val));
        v.volume = clamped;
        v.muted = clamped === 0;
        setVolume(clamped);
        setMuted(clamped === 0);
    };

    const toggleFullscreen = () => {
        const el = containerRef.current;
        if (!el) return;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void el.requestFullscreen?.();
    };
    useEffect(() => {
        const onFs = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
        document.addEventListener("fullscreenchange", onFs);
        return () => document.removeEventListener("fullscreenchange", onFs);
    }, []);

    // Captions: keep the chosen track "hidden" (fires cuechange without the
    // browser's native multi-line box) and surface the current cue as one line.
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const tracks = v.textTracks;
        let active: TextTrack | null = null;
        for (let i = 0; i < tracks.length; i++) {
            if (captionsOn && i === defaultCaption) { tracks[i].mode = "hidden"; active = tracks[i]; }
            else tracks[i].mode = "disabled";
        }
        if (!active) { setCaptionText(""); return; }
        const sync = () => {
            const cues = active!.activeCues;
            setCaptionText(
                cues && cues.length
                    ? Array.from(cues).map((c) => (c as VTTCue).text).join(" ").replace(/\s+/g, " ").trim()
                    : "",
            );
        };
        sync();
        active.addEventListener("cuechange", sync);
        return () => active.removeEventListener("cuechange", sync);
    }, [captionsOn, defaultCaption, captionTracks.length]);

    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
    const volumePct = (muted ? 0 : volume) * 100;
    const volumeLevel = muted || volume === 0 ? "muted" : volume < 0.5 ? "low" : "high";

    const scrubFraction = (clientX: number) => {
        const rect = scrubRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };
    const seekTo = (frac: number) => {
        const v = videoRef.current;
        if (!v || !duration) return;
        v.currentTime = frac * duration;
        setCurrentTime(frac * duration);
    };

    return (
        <div
            ref={containerRef}
            className={cn("group/fvp relative h-full w-full overflow-hidden bg-black select-none", className)}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <video
                ref={videoRef}
                src={videoUrl}
                poster={poster ?? undefined}
                preload="metadata"
                crossOrigin="anonymous"
                playsInline
                className="h-full w-full cursor-pointer object-cover"
                onClick={togglePlay}
                onPlay={() => { setIsPlaying(true); setStarted(true); }}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                onProgress={(e) => { const b = e.currentTarget.buffered; if (b.length) setBuffered(b.end(b.length - 1)); }}
            >
                {captionTracks.map((t) => (
                    <track key={t.id} kind="subtitles" src={t.url} srcLang={t.language} label={t.label} />
                ))}
            </video>

            {/* Center play button — until first play and whenever paused. */}
            {!isPlaying && (
                <button
                    type="button"
                    aria-label="Play"
                    onClick={togglePlay}
                    className="absolute inset-0 z-10 flex items-center justify-center"
                >
                    <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform hover:scale-105">
                        <PlayPauseMorph playing={false} className="size-7" />
                    </span>
                </button>
            )}

            {/* Current caption line, above the controls. */}
            {captionsOn && captionText && (
                <div className="pointer-events-none absolute inset-x-0 bottom-12 z-20 flex justify-center px-4">
                    <span className="max-w-full truncate rounded bg-black/70 px-2 py-0.5 text-sm font-semibold text-white">{captionText}</span>
                </div>
            )}

            {/* Bottom chrome — gradient + scrubber + controls. Container itself is
                click-through; only the interactive bits capture pointer events. */}
            <div
                className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 z-20 px-2 pb-1 transition-opacity duration-200",
                    isPlaying ? "opacity-0 group-hover/fvp:opacity-100" : "opacity-100",
                )}
            >
                <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-20 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

                {/* Scrubber */}
                <div
                    ref={scrubRef}
                    className="pointer-events-auto relative mb-0.5 h-3.5 cursor-pointer"
                    onMouseMove={(e) => setScrubHover(scrubFraction(e.clientX))}
                    onMouseLeave={() => { if (!isScrubbingRef.current) setScrubHover(null); }}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        seekTo(scrubFraction(e.clientX));
                        isScrubbingRef.current = true;
                        const onMove = (ev: PointerEvent) => { const f = scrubFraction(ev.clientX); seekTo(f); setScrubHover(f); };
                        const onUp = () => {
                            isScrubbingRef.current = false;
                            setScrubHover(null);
                            document.removeEventListener("pointermove", onMove);
                            document.removeEventListener("pointerup", onUp);
                        };
                        document.addEventListener("pointermove", onMove);
                        document.addEventListener("pointerup", onUp);
                    }}
                >
                    <div
                        className="absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full transition-[height] duration-150"
                        style={{ height: scrubHover !== null ? 5 : 3 }}
                    >
                        <div className="absolute inset-0 bg-white/30" />
                        <div className="absolute inset-y-0 left-0 bg-white/50" style={{ width: `${bufferedPct}%` }} />
                        <div className="absolute inset-y-0 left-0 bg-twitter2" style={{ width: `${progressPct}%` }} />
                    </div>
                    <div
                        className="pointer-events-none absolute top-1/2 size-3 rounded-full bg-twitter2 shadow"
                        style={{ left: `${progressPct}%`, transform: `translate(-50%,-50%) scale(${scrubHover !== null ? 1.3 : 0})`, transition: "transform 150ms" }}
                    />
                </div>

                {/* Controls row */}
                <div className="pointer-events-auto flex h-9 items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                        {/* Play / pause */}
                        <button
                            type="button"
                            aria-label={isPlaying ? "Pause" : "Play"}
                            onClick={togglePlay}
                            className="rounded-full bg-black/30 p-1 text-white transition-colors"
                        >
                            <span className="flex items-center justify-center rounded-full p-1 transition-colors hover:bg-white/30">
                                <PlayPauseMorph playing={isPlaying} className="size-5" />
                            </span>
                        </button>

                        {/* Volume — mute toggle + slider that expands on hover */}
                        <div
                            className="group/vol flex items-center rounded-full bg-black/30 p-1"
                            onWheel={(e) => { e.preventDefault(); adjustVolume((muted ? 0 : volume) + (e.deltaY < 0 ? 0.05 : -0.05)); }}
                        >
                            <button
                                type="button"
                                aria-label={muted ? "Unmute" : "Mute"}
                                onClick={toggleMute}
                                className="flex size-7 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
                            >
                                <VolumeMorph level={volumeLevel} className="size-5" />
                            </button>
                            <div className="w-0 overflow-hidden transition-[width] duration-200 group-hover/vol:w-16">
                                <div
                                    className="relative mx-1.5 flex h-5 w-12 cursor-pointer items-center"
                                    onPointerDown={(e) => {
                                        const el = e.currentTarget;
                                        el.setPointerCapture(e.pointerId);
                                        const set = (clientX: number) => {
                                            const r = el.getBoundingClientRect();
                                            adjustVolume((clientX - r.left) / r.width);
                                        };
                                        set(e.clientX);
                                        const move = (ev: PointerEvent) => set(ev.clientX);
                                        const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
                                        document.addEventListener("pointermove", move);
                                        document.addEventListener("pointerup", up);
                                    }}
                                >
                                    <div className="absolute inset-x-0 h-1 rounded-full bg-white/30">
                                        <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${volumePct}%` }} />
                                    </div>
                                    <div className="absolute size-3 -translate-x-1/2 rounded-full bg-white shadow" style={{ left: `${volumePct}%` }} />
                                </div>
                            </div>
                        </div>

                        {/* Time */}
                        <span className="px-1 text-xs font-medium tabular-nums text-white drop-shadow">
                            {formatTime(currentTime)}
                            <span className="text-white/60"> / {formatTime(duration)}</span>
                        </span>
                    </div>

                    {/* Captions (when present) + fullscreen */}
                    <div className="flex items-center gap-0.5 rounded-full bg-black/30 p-1">
                        {captionTracks.length > 0 && (
                            <button
                                type="button"
                                aria-label={captionsOn ? "Turn off captions" : "Turn on captions"}
                                onClick={() => setCaptionsOn((c) => !c)}
                                className={cn("flex size-7 items-center justify-center rounded-full transition-colors hover:bg-white/20", captionsOn ? "text-twitter2" : "text-white")}
                            >
                                <CaptionsMorph on={captionsOn} className="size-5" />
                            </button>
                        )}
                        <button
                            type="button"
                            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                            onClick={toggleFullscreen}
                            className="flex size-7 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
                        >
                            <FullscreenMorph active={isFullscreen} className="size-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
