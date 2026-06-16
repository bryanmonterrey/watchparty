"use client";

import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
    YTPlayIcon,
    YTPauseIcon,
    YTReplayIcon,
    YTSettingsIcon,
    YTTheaterModeIcon,
    YTSubtitlesIcon,
    YTPiPIcon,
    YTAirPlayIcon,
    YTLoopIcon,
    YTDownloadIcon,
} from "@/components/icons";
import { PlayPauseMorph, VolumeMorph, CaptionsMorph, FullscreenMorph } from "@/components/morph-icons";
import { Scrubber } from "./scrubber";
import { FineScrubStrip, STRIP_H } from "./fine-scrub-strip";
import { SettingsMenu } from "./settings-menu";
import type { VttThumb } from "./use-preview-thumbnails";
import type { Chapter, ProgressDot, Marker, OpenMenu } from "./types";
import type { UseCaptionStyleReturn } from "./use-caption-style";

interface ControlsBarProps {
    // Scrubber props
    timelineRef: React.RefObject<HTMLDivElement | null>;
    hoverPercent: number | null;
    setHoverPercent: (v: number | null) => void;
    isScrubbing: boolean;
    isScrubbingRef: React.RefObject<boolean>;
    isFineScrubbing: boolean;
    setIsFineScrubbing: (v: boolean) => void;
    currentTime: number;
    duration: number;
    buffered: number;
    thumbDataUrl: string | null;
    vttThumb?: VttThumb | null;
    heatmapBuckets: number[];
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
    // Controls props
    isEnded: boolean;
    isPlaying: boolean;
    loop: boolean;
    toggleLoop: () => void;
    videoUrl?: string | null;
    togglePlay: () => void;
    onReplay: () => void;
    volumeLevel: "muted" | "low" | "high";
    toggleMute: () => void;
    volume: number;
    isMuted: boolean;
    volumeTrackRef: React.RefObject<HTMLDivElement | null>;
    adjustVolume: (val: number) => void;
    isDraggingVolumeRef: React.RefObject<boolean>;
    // Menu state
    openMenu: OpenMenu;
    setOpenMenu: (m: OpenMenu | ((prev: OpenMenu) => OpenMenu)) => void;
    // Settings menu data
    playbackRate: number;
    qualities: Array<{ label: string; level: number }>;
    selectedQuality: number;
    audioTracks: Array<{ label: string; id: number }>;
    selectedAudio: number;
    setRate: (rate: number) => void;
    setQuality: (level: number) => void;
    setAudioTrack: (id: number) => void;
    // Subtitles menu data
    textTracks: Array<{ label: string; index: number }>;
    selectedTrack: number;
    setSubtitleTrack: (index: number) => void;
    // Right controls
    autoplay: boolean;
    setAutoplay: (fn: (a: boolean) => boolean) => void;
    isFullscreen: boolean;
    toggleFullscreen: () => void;
    isTheaterMode: boolean;
    toggleTheaterMode: () => void;
    airplayAvailable: boolean;
    onEnterMiniPlayer?: (currentTime: number) => void;
    show: (ctrl: string) => boolean;
    speedLabel: string;
    isLive?: boolean;
    scrubberRainbow: boolean;
    toggleScrubberRainbow: () => void;
    ambientMode: boolean;
    toggleAmbientMode: () => void;
    captionStyle?: UseCaptionStyleReturn;
    stableVolume: boolean;
    voiceBoost: boolean;
    spatialBoost: boolean;
    toggleStableVolume: () => void;
    toggleVoiceBoost: () => void;
    toggleSpatialBoost: () => void;
}

export function ControlsBar({
    timelineRef,
    hoverPercent,
    setHoverPercent,
    isScrubbing,
    isScrubbingRef,
    isFineScrubbing,
    setIsFineScrubbing,
    currentTime,
    duration,
    buffered,
    thumbDataUrl,
    vttThumb,
    heatmapBuckets,
    thumbnailUrl,
    chapters,
    progressDots,
    markers,
    isWaiting,
    seekThumb,
    wasPausedRef,
    videoRef,
    setCurrentTime,
    setIsScrubbing,
    formatTime,
    getChapterAtTime,
    isEnded,
    isPlaying,
    loop,
    toggleLoop,
    videoUrl,
    togglePlay,
    onReplay,
    volumeLevel,
    toggleMute,
    volume,
    isMuted,
    volumeTrackRef,
    adjustVolume,
    isDraggingVolumeRef,
    openMenu,
    setOpenMenu,
    playbackRate,
    qualities,
    selectedQuality,
    audioTracks,
    selectedAudio,
    setRate,
    setQuality,
    setAudioTrack,
    textTracks,
    selectedTrack,
    setSubtitleTrack,
    autoplay,
    setAutoplay,
    isFullscreen,
    toggleFullscreen,
    isTheaterMode,
    toggleTheaterMode,
    airplayAvailable,
    onEnterMiniPlayer,
    show,
    speedLabel,
    isLive = false,
    scrubberRainbow,
    toggleScrubberRainbow,
    ambientMode,
    toggleAmbientMode,
    captionStyle,
    stableVolume,
    voiceBoost,
    spatialBoost,
    toggleStableVolume,
    toggleVoiceBoost,
    toggleSpatialBoost,
}: ControlsBarProps) {
    // Local fine-scrub progress (0–1). Drives proportional transforms during drag;
    // snaps to 0 or 1 on release. Decoupled from the boolean isFineScrubbing so
    // that animation never does a hard boolean flip.
    const [fineScrubProgress, setFineScrubProgress] = useState(0);
    const [isDraggingFineScrub, setIsDraggingFineScrub] = useState(false);
    const [showTimeRemaining, setShowTimeRemaining] = useState(false);

    // When the boolean state changes from *outside* (click-outside overlay, dismiss,
    // play-from-here), sync the local progress with a CSS transition.
    useEffect(() => {
        if (!isDraggingFineScrub) {
            setFineScrubProgress(isFineScrubbing ? 1 : 0);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFineScrubbing]);

    // Called by Scrubber on every pointermove (isDragging=true) and on pointer release
    // (isDragging=false, progress snapped to 0 or 1).
    const handleFineScrubProgress = useCallback((progress: number, isDragging: boolean) => {
        setFineScrubProgress(progress);
        setIsDraggingFineScrub(isDragging);
        if (!isDragging) {
            // Snap: update the external boolean state so video-player's overlay,
            // dismiss button, etc. all know the final open/closed state.
            setIsFineScrubbing(progress >= 0.5);
        }
    }, [setIsFineScrubbing]);

    const snapTransition = isDraggingFineScrub ? "transform 0.2s cubic-bezier(0,0,0.2,1)" : "transform 0.2s cubic-bezier(0.4,0,0.2,1)";

    return (
        <div className="ytp-chrome-bottom absolute bottom-0 left-0 right-0 px-3 pb-1 pointer-events-auto flex flex-col gap-0 z-20">

            {/* ── Fine scrub strip ─────────────────────────────────────────────
                Outer div: static overflow-hidden clip — never moves, prevents the
                strip from bleeding below the player.
                Inner div: slides up/down proportionally to fineScrubProgress.
            ─────────────────────────────────────────────────────────────────── */}
            <div
                className="absolute inset-x-0 bottom-0 overflow-hidden pointer-events-none"
                style={{ height: STRIP_H }}
            >
                <div
                    className="absolute inset-x-0 bottom-0"
                    style={{
                        height: STRIP_H,
                        transform: `translateY(${STRIP_H * (1 - fineScrubProgress)}px)`,
                        transition: snapTransition,
                    }}
                >
                    <FineScrubStrip
                        isActive={fineScrubProgress >= 1}
                        currentTime={currentTime}
                        duration={duration}
                        thumbDataUrl={thumbDataUrl}
                        thumbnailUrl={thumbnailUrl}
                        onScrub={(time) => {
                            if (videoRef.current) videoRef.current.currentTime = time;
                            setCurrentTime(time);
                            seekThumb(time);
                        }}
                    />
                </div>
            </div>

            {/* ── Scrubber + action row above it (hidden for live streams) ────── */}
            {isLive ? null : <div
                style={{
                    transform: `translateY(${-24 * fineScrubProgress}px)`,
                    transition: snapTransition,
                    position: "relative",
                }}
            >
                {/* Play / Time / Dismiss — fades in above the progress bar */}
                <div
                    className="absolute inset-x-0 bottom-full mb-2 flex items-center justify-between px-1 pointer-events-none"
                    style={{
                        opacity: fineScrubProgress,
                        pointerEvents: fineScrubProgress >= 1 ? "auto" : "none",
                    }}
                >
                    <button
                        className="text-white hover:text-white/80 cursor-pointer"
                        onClick={() => { setIsFineScrubbing(false); void videoRef.current?.play(); }}
                        title="Play from this position"
                    >
                        <YTPlayIcon className="size-5" />
                    </button>
                    <span className="text-white text-xs font-semibold tabular-nums bg-black/60 px-2 py-0.5 rounded-full">
                        {formatTime(currentTime)}
                    </span>
                    <button
                        className="text-white hover:text-white/80 cursor-pointer"
                        onClick={() => setIsFineScrubbing(false)}
                        title="Exit precise seeking"
                    >
                        <svg viewBox="0 0 24 24" className="size-5 fill-current">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </div>

                <Scrubber
                    timelineRef={timelineRef}
                    hoverPercent={hoverPercent}
                    setHoverPercent={setHoverPercent}
                    isScrubbing={isScrubbing}
                    isScrubbingRef={isScrubbingRef}
                    _fineScrubProgress={fineScrubProgress}
                    isDraggingFineScrub={isDraggingFineScrub}
                    onFineScrubProgress={handleFineScrubProgress}
                    currentTime={currentTime}
                    duration={duration}
                    buffered={buffered}
                    thumbDataUrl={thumbDataUrl}
                    vttThumb={vttThumb}
                    heatmapBuckets={heatmapBuckets}
                    thumbnailUrl={thumbnailUrl}
                    chapters={chapters}
                    progressDots={progressDots}
                    markers={markers}
                    isWaiting={isWaiting}
                    seekThumb={seekThumb}
                    wasPausedRef={wasPausedRef}
                    videoRef={videoRef}
                    setCurrentTime={setCurrentTime}
                    setIsScrubbing={setIsScrubbing}
                    formatTime={formatTime}
                    getChapterAtTime={getChapterAtTime}
                    rainbow={scrubberRainbow}
                />
            </div>}

            {/* ── Controls row — slides DOWN proportionally out of view ── */}
            <div
                className="ytp-chrome-controls flex items-center justify-between h-[56px]"
                style={{
                    transform: `translateY(${56 * fineScrubProgress}px)`,
                    transition: snapTransition,
                }}
            >

                {/* Left controls */}
                <div className="ytp-left-controls flex gap-1 items-center h-full">

                    <button
                        onClick={() => isEnded ? onReplay() : void togglePlay()}
                        className="ytp-button cursor-pointer p-1 bg-black/30 flex items-center justify-center text-white/90 hover:text-white rounded-full transition-colors"
                    >
                        <div className="flex rounded-full items-center justify-center hover:bg-white/35 p-1">
                            {isEnded
                                ? <YTReplayIcon className="size-[24px]" />
                                : <PlayPauseMorph playing={isPlaying} className="size-[24px]" />
                            }
                        </div>
                    </button>

                    {/* Loop toggle */}
                    <button
                        onClick={toggleLoop}
                        className={cn(
                            "ytp-button cursor-pointer p-1 flex items-center justify-center rounded-full transition-colors",
                            loop ? "text-twitter2" : "text-white/60 hover:text-white"
                        )}
                        title={loop ? "Loop on" : "Loop off"}
                    >
                        <div className="flex rounded-full items-center justify-center hover:bg-white/35 p-1">
                            <YTLoopIcon className="size-[20px]" />
                        </div>
                    </button>

                    {/* Volume */}
                    <div
                        className="ytp-volume-area cursor-pointer rounded-full flex items-center h-full group/vol"
                        onWheel={(e) => {
                            e.preventDefault();
                            adjustVolume(Math.max(0, Math.min(1, (isMuted ? 0 : volume) + (e.deltaY < 0 ? 0.05 : -0.05))));
                        }}
                    >
                        <div className="bg-black/30 transition-[width] duration-200 ease-out p-1 rounded-full flex items-center justify-center">
                            <div className="flex items-center hover:bg-white/20 rounded-full p-1">
                                <button onClick={toggleMute} className="ytp-button cursor-pointer flex items-center justify-center text-white/90 hover:text-white rounded-full transition-colors">
                                    <VolumeMorph level={volumeLevel} className="size-[24px] cursor-pointer" />
                                </button>
                                <div className="w-0 group-hover/vol:w-[56px] overflow-hidden h-6 transition-[width] duration-200 ease-out flex items-center justify-center">
                                    <div
                                        ref={volumeTrackRef}
                                        className="relative flex items-center cursor-pointer"
                                        style={{ width: 40, height: 20 }}
                                        onPointerDown={(e) => {
                                            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                            adjustVolume(pct);
                                            isDraggingVolumeRef.current = true;
                                        }}
                                    >
                                        <div className="absolute inset-x-0 h-1 rounded-full bg-white/30 pointer-events-none">
                                            <div
                                                className="absolute inset-y-0 left-0 bg-twitter2 rounded-full"
                                                style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                                            />
                                        </div>
                                        <div
                                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-twitter2 rounded-full pointer-events-none shadow hidden group-hover/vol:block"
                                            style={{ left: `${(isMuted ? 0 : volume) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Time display — LIVE badge for streams, click-to-toggle remaining for VOD */}
                    {isLive ? (
                        <div className="flex items-center p-1 bg-black/30 rounded-full">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-white text-[13px] font-semibold tracking-wide">LIVE</span>
                            </div>
                        </div>
                    ) : (
                        <div
                            className="flex items-center p-1 bg-black/30 cursor-pointer rounded-full"
                            onClick={() => setShowTimeRemaining(v => !v)}
                        >
                            <div className="flex items-center hover:bg-white/35 px-2 transition-colors text-white text-[13px] font-normal tabular-nums p-1 rounded-full">
                                <div className="p-0.5 rounded-full flex items-center justify-center">
                                    {showTimeRemaining ? (
                                        <>
                                            <span className="ytp-time-current">-{formatTime(Math.max(0, duration - currentTime))}</span>
                                            <span className="ytp-time-separator px-1">/</span>
                                            <span className="ytp-time-duration opacity-70">{formatTime(duration)}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="ytp-time-current">{formatTime(currentTime)}</span>
                                            <span className="ytp-time-separator px-1">/</span>
                                            <span className="ytp-time-duration opacity-70">{formatTime(duration)}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right controls */}
                <div className="ytp-right-controls flex items-center h-full">
                    <div className="relative flex items-center gap-1 justify-center p-1 bg-black/30 cursor-pointer rounded-full">

                        {/* ── Settings popup ──────────────────────────── */}
                        <SettingsMenu
                            open={openMenu === "settings" || openMenu === "subtitles"}
                            onClose={() => setOpenMenu(null)}
                            initialView={openMenu === "subtitles" ? "subtitles" : "main"}
                            playbackRate={playbackRate}
                            qualities={qualities}
                            selectedQuality={selectedQuality}
                            audioTracks={audioTracks}
                            selectedAudio={selectedAudio}
                            setRate={setRate}
                            setQuality={setQuality}
                            setAudioTrack={setAudioTrack}
                            textTracks={textTracks}
                            selectedTrack={selectedTrack}
                            setSubtitleTrack={setSubtitleTrack}
                            scrubberRainbow={scrubberRainbow}
                            toggleScrubberRainbow={toggleScrubberRainbow}
                            ambientMode={ambientMode}
                            toggleAmbientMode={toggleAmbientMode}
                            captionStyle={captionStyle}
                            stableVolume={stableVolume}
                            voiceBoost={voiceBoost}
                            spatialBoost={spatialBoost}
                            toggleStableVolume={toggleStableVolume}
                            toggleVoiceBoost={toggleVoiceBoost}
                            toggleSpatialBoost={toggleSpatialBoost}
                        />

                        {show("autoplay") && (
                            <button
                                className="ytp-button p-1 hover:bg-white/35 cursor-pointer transition-colors rounded-full flex items-center justify-center text-white/90 hover:text-white"
                                onClick={() => setAutoplay(a => !a)}
                                title={autoplay ? "Autoplay is on" : "Autoplay is off"}
                            >
                                <div className="ytp-autonav-toggle-button-container scale-[0.85]">
                                    <div className={`ytp-autonav-toggle-button w-[36px] h-[24px] rounded-full relative transition-colors flex items-center justify-center duration-200 ${autoplay ? "bg-twitter2" : "bg-white/20"}`}>
                                        <div className={`absolute transition-all duration-200 bg-white rounded-full  flex items-center justify-center ${autoplay ? "left-[16px]" : "left-[0px]"}`}>
                                            <div className={cn("size-[20px] p-1 rounded-full flex items-center justify-center", autoplay ? "text-twitter2" : "text-black/40")}>
                                                {autoplay ? <YTPlayIcon /> : <YTPauseIcon />}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        )}

                        {show("subtitles") && (
                            <button
                                className={cn("ytp-button p-1 px-3 hover:bg-white/35 cursor-pointer transition-colors rounded-full flex items-center justify-center", selectedTrack >= 0 ? "text-twitter2" : "text-white/90 hover:text-white")}
                                onClick={() => setSubtitleTrack(selectedTrack >= 0 ? -1 : (textTracks[0]?.index ?? 0))}
                                title={selectedTrack >= 0 ? "Subtitles on" : "Subtitles off"}
                            >
                                <CaptionsMorph on={selectedTrack >= 0} className="size-[24px]" />
                            </button>
                        )}

                        {show("settings") && (
                            <button
                                className="ytp-button p-1 px-3 hover:bg-white/35 cursor-pointer transition-colors rounded-full flex items-center justify-center text-white/90 hover:text-white relative"
                                onClick={() => setOpenMenu(m => m === "settings" ? null : "settings")}
                                title="Settings"
                            >
                                <YTSettingsIcon className="size-[24px]" />
                                <div className="absolute top-[8px] right-[4px] bg-twitter2 text-[8px] font-bold px-[2px] rounded-[1px] leading-tight scale-90">
                                    {speedLabel}
                                </div>
                            </button>
                        )}

                        {show("pip") && (
                            <button
                                className="ytp-button px-2 hover:bg-white/35 cursor-pointer transition-colors rounded-full flex items-center justify-center text-white/90 hover:text-white"
                                onClick={() => onEnterMiniPlayer?.(videoRef.current?.currentTime ?? 0)}
                                title="Mini player"
                            >
                                <YTPiPIcon className="size-[36px]" />
                            </button>
                        )}

                        {show("airplay") && airplayAvailable && (
                            <button
                                className="ytp-button p-1 px-3 hover:bg-white/35 cursor-pointer transition-colors rounded-full flex items-center justify-center text-white/90 hover:text-white"
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                onClick={() => (videoRef.current as any)?.webkitShowPlaybackTargetPicker?.()}
                                title="AirPlay"
                            >
                                <YTAirPlayIcon className="size-[24px]" />
                            </button>
                        )}

                        {show("theater") && (
                            <button
                                className={cn("ytp-button p-1 px-3 hover:bg-white/35 cursor-pointer transition-colors rounded-full flex items-center justify-center hover:text-white", isTheaterMode ? "text-twitter2" : "text-white/90")}
                                onClick={toggleTheaterMode}
                                title={isTheaterMode ? "Default view" : "Theater mode"}
                            >
                                <YTTheaterModeIcon className="size-[24px]" />
                            </button>
                        )}

                        {videoUrl && !videoUrl.includes(".m3u8") && (
                            <a
                                href={videoUrl}
                                download
                                className="ytp-button p-1 px-3 hover:bg-white/35 cursor-pointer transition-colors rounded-full flex items-center justify-center text-white/90 hover:text-white"
                                title="Download"
                                onClick={e => e.stopPropagation()}
                            >
                                <YTDownloadIcon className="size-[24px]" />
                            </a>
                        )}

                        <button
                            onClick={toggleFullscreen}
                            className="ytp-button p-1 px-3 hover:bg-white/35 cursor-pointer transition-colors rounded-full flex items-center justify-center text-white/90 hover:text-white"
                        >
                            <FullscreenMorph active={isFullscreen} className="size-[24px]" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
