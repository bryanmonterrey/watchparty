"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { PlayPauseMorph, VolumeMorph, CaptionsMorph, FullscreenMorph } from "@/components/morph-icons";
import { YTReplayIcon, YTSettingsIcon } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// m:ss, or h:mm:ss past an hour.
function formatTime(seconds: number) {
    const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface FeedVideoPlayerProps {
    postId: string;
    videoUrl: string;
    poster?: string | null;
    className?: string;
}

// Compact feed player (discover). The control bar is a 1:1 match of the
// /video player's controls-bar.tsx — same grouped black/30 pills at
// --player-control-h, the same morph icons at size-[24px], the same volume
// pill with an expanding twitter2 slider, the same time/remaining toggle, and
// the same twitter2 scrubber. The watch-only controls that don't apply to a
// plain feed mp4 (HLS quality/audio tracks, theater, PiP, AirPlay, download,
// autoplay-next, chapters/heatmap) are omitted; speed/captions/fullscreen stay.
export function FeedVideoPlayer({ postId, videoUrl, poster, className }: FeedVideoPlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const scrubRef = useRef<HTMLDivElement>(null);

    const [started, setStarted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isEnded, setIsEnded] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [captionsOn, setCaptionsOn] = useState(false);
    const [captionText, setCaptionText] = useState("");
    const [scrubHover, setScrubHover] = useState<number | null>(null);
    const [showRemaining, setShowRemaining] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [speedOpen, setSpeedOpen] = useState(false);
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
        if (v.paused) { setStarted(true); setIsEnded(false); void v.play().catch(() => {}); }
        else v.pause();
    }, []);

    const onReplay = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = 0;
        setIsEnded(false);
        void v.play().catch(() => {});
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

    const changeSpeed = (speed: number) => {
        const v = videoRef.current;
        if (v) v.playbackRate = speed;
        setPlaybackRate(speed);
        setSpeedOpen(false);
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
                onPlay={() => { setIsPlaying(true); setStarted(true); setIsEnded(false); }}
                onPause={() => setIsPlaying(false)}
                onEnded={() => { setIsPlaying(false); setIsEnded(true); }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                onProgress={(e) => { const b = e.currentTarget.buffered; if (b.length) setBuffered(b.end(b.length - 1)); }}
            >
                {captionTracks.map((t) => (
                    <track key={t.id} kind="subtitles" src={t.url} srcLang={t.language} label={t.label} />
                ))}
            </video>

            {/* Center play / replay — until first play and whenever paused. */}
            {!isPlaying && (
                <button
                    type="button"
                    aria-label={isEnded ? "Replay" : "Play"}
                    onClick={isEnded ? onReplay : togglePlay}
                    className="absolute inset-0 z-10 flex items-center justify-center"
                >
                    <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform hover:scale-105">
                        {isEnded ? <YTReplayIcon className="size-7" /> : <PlayPauseMorph playing={false} className="size-7" />}
                    </span>
                </button>
            )}

            {/* Current caption line, above the controls. */}
            {captionsOn && captionText && (
                <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-4">
                    <span className="max-w-full truncate rounded bg-black/70 px-2 py-0.5 text-sm font-semibold text-white">{captionText}</span>
                </div>
            )}

            {/* ── Bottom chrome — scrubber + controls row, 1:1 with the /video bar.
                Container is click-through; only the interactive bits capture. ── */}
            <div
                className={cn(
                    "ytp-chrome-bottom pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex flex-col px-3 pb-1 transition-opacity duration-200",
                    isPlaying ? "opacity-0 group-hover/fvp:opacity-100" : "opacity-100",
                )}
            >
                <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

                {/* Scrubber */}
                <div
                    ref={scrubRef}
                    className="pointer-events-auto relative cursor-pointer select-none"
                    style={{ height: 16, display: "flex", alignItems: "center" }}
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
                        className="absolute inset-x-0 overflow-hidden rounded-full bg-white/30 transition-[height] duration-150"
                        style={{ height: scrubHover !== null ? 5 : 3 }}
                    >
                        <div className="absolute inset-y-0 left-0 bg-twitter2/50" style={{ width: `${bufferedPct}%` }} />
                        <div className="absolute inset-y-0 left-0 bg-twitter2" style={{ width: `${progressPct}%` }} />
                    </div>
                    <div
                        className="absolute h-3 w-3 rounded-full bg-twitter2 shadow-md pointer-events-none"
                        style={{
                            left: `${progressPct}%`,
                            top: "50%",
                            transform: `translate(-50%, -50%) scale(${scrubHover !== null ? 1.4 : 0})`,
                            transition: "transform 0.15s cubic-bezier(0.05, 0, 0, 1)",
                        }}
                    />
                </div>

                {/* Controls row */}
                <div className="ytp-chrome-controls pointer-events-auto flex h-[56px] items-center justify-between">
                    {/* Left controls */}
                    <div className="flex h-full items-center gap-1">
                        {/* Play / pause / replay */}
                        <button
                            onClick={isEnded ? onReplay : togglePlay}
                            aria-label={isEnded ? "Replay" : isPlaying ? "Pause" : "Play"}
                            className="ytp-button h-(--player-control-h) cursor-pointer rounded-full bg-black/30 p-1 text-white/90 transition-colors hover:text-white flex items-center justify-center"
                        >
                            <div className="flex items-center justify-center rounded-full p-1 hover:bg-white/35">
                                {isEnded ? <YTReplayIcon className="size-[24px]" /> : <PlayPauseMorph playing={isPlaying} className="size-[24px]" />}
                            </div>
                        </button>

                        {/* Volume */}
                        <div
                            className="ytp-volume-area group/vol flex h-full cursor-pointer items-center rounded-full"
                            onWheel={(e) => { e.preventDefault(); adjustVolume((muted ? 0 : volume) + (e.deltaY < 0 ? 0.05 : -0.05)); }}
                        >
                            <div className="flex h-(--player-control-h) items-center justify-center rounded-full bg-black/30 p-1">
                                <div className="flex items-center rounded-full p-1 hover:bg-white/20">
                                    <button
                                        onClick={toggleMute}
                                        aria-label={muted ? "Unmute" : "Mute"}
                                        className="ytp-button flex h-full cursor-pointer items-center justify-center rounded-full text-white/90 transition-colors hover:text-white"
                                    >
                                        <VolumeMorph level={volumeLevel} className="size-[24px] cursor-pointer" />
                                    </button>
                                    <div className="flex h-6 w-0 items-center justify-center overflow-hidden transition-[width] duration-200 ease-out group-hover/vol:w-[56px]">
                                        <div
                                            className="relative flex cursor-pointer items-center"
                                            style={{ width: 40, height: 20 }}
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
                                            <div className="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-white/30">
                                                <div className="absolute inset-y-0 left-0 rounded-full bg-twitter2" style={{ width: `${volumePct}%` }} />
                                            </div>
                                            <div className="pointer-events-none absolute top-1/2 hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-twitter2 shadow group-hover/vol:block" style={{ left: `${volumePct}%` }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Time / remaining toggle */}
                        <div
                            className="flex h-(--player-control-h) cursor-pointer items-center rounded-full bg-black/30 p-1"
                            onClick={() => setShowRemaining((v) => !v)}
                        >
                            <div className="flex items-center rounded-full p-1 px-2 text-[13px] font-normal tabular-nums text-white transition-colors hover:bg-white/35">
                                <div className="flex items-center justify-center rounded-full p-0.5">
                                    {showRemaining ? (
                                        <><span>-{formatTime(Math.max(0, duration - currentTime))}</span><span className="px-1">/</span><span className="opacity-70">{formatTime(duration)}</span></>
                                    ) : (
                                        <><span>{formatTime(currentTime)}</span><span className="px-1">/</span><span className="opacity-70">{formatTime(duration)}</span></>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right controls — single pill: settings (speed) · captions · fullscreen */}
                    <div className="ytp-right-controls flex h-full items-center">
                        <div className="relative flex h-(--player-control-h) items-center justify-center gap-1 rounded-full bg-black/30 p-1">
                            <Popover open={speedOpen} onOpenChange={setSpeedOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        aria-label="Settings"
                                        className="ytp-button relative flex h-full cursor-pointer items-center justify-center rounded-full p-1 px-3 text-white/90 transition-colors hover:bg-white/35 hover:text-white"
                                    >
                                        <YTSettingsIcon className="size-[24px]" />
                                        {playbackRate !== 1 && (
                                            <div className="absolute right-[4px] top-[8px] scale-90 rounded-[1px] bg-twitter2 px-[2px] text-[8px] font-bold leading-tight text-white">
                                                {playbackRate}×
                                            </div>
                                        )}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent
                                    side="top"
                                    align="end"
                                    sideOffset={8}
                                    className="flex w-40 flex-col gap-0.5 rounded-2xl border-flexborder/75 bg-neutral-950 p-1.5 shadow-[0_0_15px_5px_rgba(255,255,255,0.08)] ring ring-white/10"
                                >
                                    <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Playback speed</p>
                                    {SPEEDS.map((speed) => (
                                        <button
                                            key={speed}
                                            onClick={() => changeSpeed(speed)}
                                            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-white/5"
                                        >
                                            <span className={playbackRate === speed ? "text-white" : "text-zinc-400"}>{speed === 1 ? "Normal" : `${speed}×`}</span>
                                            {playbackRate === speed && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                                        </button>
                                    ))}
                                </PopoverContent>
                            </Popover>

                            {captionTracks.length > 0 && (
                                <button
                                    onClick={() => setCaptionsOn((c) => !c)}
                                    aria-label={captionsOn ? "Turn off captions" : "Turn on captions"}
                                    className={cn("ytp-button flex h-full cursor-pointer items-center justify-center rounded-full p-1 px-3 transition-colors hover:bg-white/35", captionsOn ? "text-twitter2" : "text-white/90 hover:text-white")}
                                >
                                    <CaptionsMorph on={captionsOn} className="size-[24px]" />
                                </button>
                            )}

                            <button
                                onClick={toggleFullscreen}
                                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                                className="ytp-button flex h-full cursor-pointer items-center justify-center rounded-full p-1 px-3 text-white/90 transition-colors hover:bg-white/35 hover:text-white"
                            >
                                <FullscreenMorph active={isFullscreen} className="size-[24px]" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
