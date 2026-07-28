"use client";

import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { PlayerLoadingScreen } from "../player-loading";
import { MiniPlayerOverlay } from "../mini-player-overlay";
import { usePlayer } from "./use-player";
import { Bezel } from "./bezel";
import { ControlsBar } from "./controls-bar";
import { EndScreen } from "./end-screen";
import { CardsPlayerOverlay } from "../cards";
import type { CardType } from "../cards";
import { trpc } from "@/lib/trpc/client";
import type { VideoPlayerProps } from "./types";

export function VideoPlayer(props: VideoPlayerProps) {
    const {
        postId,
        title,
        thumbnailUrl,
        isLoading,
        chapters = [],
        progressDots = [],
        markers = [],
        isMiniPlayer = false,
        onEnterMiniPlayer,
        onMiniPlayerClose,
        onMiniPlayerExpand,
        adTagUrl,
        videoUrl,
        showCards = true,
    } = props;

    const player = usePlayer(props);

    const { data: cardsData } = trpc.cards.list.useQuery(
        { postId },
        { enabled: showCards && !!postId }
    );

    const {
        containerRef,
        videoRef,
        wasPausedRef,
        isScrubbingRef,
        isDraggingVolumeRef,
        volumeTrackRef,
        bezelWrapRef,
        bezelCircleRef,
        timelineRef,
        isPlaying,
        isStarted,
        isEnded,
        currentTime,
        setCurrentTime,
        duration,
        autoplay,
        setAutoplay,
        playbackRate,
        volume,
        isMuted,
        isFullscreen,
        isTheaterMode,
        showControls,
        openMenu,
        setOpenMenu,
        bezelIcon,
        airplayAvailable,
        buffered,
        hoverPercent,
        setHoverPercent,
        isScrubbing,
        setIsScrubbing,
        isFineScrubbing,
        setIsFineScrubbing,
        thumbDataUrl,
        vttThumb,
        heatmapBuckets,
        isWaiting,
        videoError,
        loop,
        toggleLoop,
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
        currentCue,
        captionTracks,
        textTracks,
        selectedTrack,
        audioTracks,
        selectedAudio,
        qualities,
        selectedQuality,
        togglePlay,
        skip,
        setRate,
        toggleTheaterMode,
        toggleFullscreen,
        toggleMute,
        adjustVolume,
        setQuality,
        setAudioTrack,
        setSubtitleTrack,
        seekThumb,
        resetControlsTimeout,
        formatTime,
        getChapterAtTime,
        volumeLevel,
        speedLabel,
        show,
        isLive,
        isTouchDevice,
        ads,
        onTimeUpdate,
        onLoadedMetadata,
        onPlay,
        onPause,
        onEnded,
        onWaiting,
        onCanPlay,
        onCanPlayThrough,
        onProgress,
        onError,
    } = player;

    if (isLoading) return <PlayerLoadingScreen />;

    return (
        <div
            ref={containerRef}
            className={cn(
                "ambient-video-container isolate p-0 relative w-full [contain:none] overflow-visible bg-black group",
                !isMiniPlayer && "aspect-video"
            )}
            style={{ cursor: !showControls && isPlaying ? "none" : "auto" }}
            aria-label={title ?? "Video player"}
            tabIndex={0}
            onContextMenu={e => e.preventDefault()}
        >
            <div className="absolute inset-0 z-0 bg-black" />

            {/* ── Video element ────────────────────────────────────────────── */}
            <video
                ref={videoRef}
                poster={thumbnailUrl ?? undefined}
                crossOrigin="anonymous"
                className="block w-full h-full outline-none relative z-10 cursor-pointer"
                onTimeUpdate={onTimeUpdate}
                onLoadedMetadata={onLoadedMetadata}
                onPlay={onPlay}
                onPause={onPause}
                onEnded={onEnded}
                onWaiting={onWaiting}
                onCanPlay={onCanPlay}
                onCanPlayThrough={onCanPlayThrough}
                loop={loop}
                onProgress={onProgress}
                onError={onError}
            >
                {/* Captions / subtitles sourced from DB */}
                {captionTracks.map((track) => (
                    <track
                        key={track.id}
                        kind="subtitles"
                        src={track.url}
                        srcLang={track.language}
                        label={track.label}
                        default={track.isDefault}
                    />
                ))}
            </video>

            {/* ── Ad container (Google IMA renders into this div) ───────────── */}
            {adTagUrl && (
                <div
                    ref={ads.adContainerRef}
                    className="absolute inset-0 z-[36] pointer-events-none"
                    style={{ pointerEvents: ads.isAdPlaying ? "auto" : "none" }}
                >
                    {ads.adCountdown && (
                        <div className="absolute bottom-16 right-4 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full font-medium tabular-nums pointer-events-none">
                            {ads.adCountdown}
                        </div>
                    )}
                </div>
            )}

            {/* ── Click/double-click interaction zones ─────────────────────── */}
            {!isMiniPlayer && (
            <div className="absolute inset-0 z-[12] flex">
                {/* Left third: single-click → play/pause (or show controls on touch), double-click → rewind 10s */}
                <div
                    className="h-full w-1/3"
                    style={{ cursor: !showControls && isPlaying ? "none" : "pointer" }}
                    onClick={() => {
                        if (isTouchDevice && !showControls) { resetControlsTimeout(); return; }
                        void togglePlay(); resetControlsTimeout();
                    }}
                    onDoubleClick={() => skip(-10)}
                />
                {/* Center: single-click → play/pause (or show controls on touch), double-click → fullscreen */}
                <div
                    className="h-full w-1/3"
                    style={{ cursor: !showControls && isPlaying ? "none" : "pointer" }}
                    onClick={() => {
                        if (isTouchDevice && !showControls) { resetControlsTimeout(); return; }
                        void togglePlay(); resetControlsTimeout();
                    }}
                    onDoubleClick={toggleFullscreen}
                />
                {/* Right third: single-click → play/pause (or show controls on touch), double-click → forward 10s */}
                <div
                    className="h-full w-1/3"
                    style={{ cursor: !showControls && isPlaying ? "none" : "pointer" }}
                    onClick={() => {
                        if (isTouchDevice && !showControls) { resetControlsTimeout(); return; }
                        void togglePlay(); resetControlsTimeout();
                    }}
                    onDoubleClick={() => skip(10)}
                />
            </div>
            )}

            {/* ── Buffering spinner ─────────────────────────────────────────── */}
            <AnimatePresence>
                {isWaiting && isStarted && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, delay: 0.3 }}
                        className="absolute inset-0 z-[14] flex items-center justify-center pointer-events-none"
                    >
                        <div className="ytp-spinner">
                            <div className="ytp-spinner-container">
                                <div className="ytp-spinner-rotator">
                                    <div className="ytp-spinner-left">
                                        <div className="ytp-spinner-circle"></div>
                                    </div>
                                    <div className="ytp-spinner-right">
                                        <div className="ytp-spinner-circle"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Error overlay ─────────────────────────────────────────────── */}
            <AnimatePresence>
                {videoError && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 z-[15] flex flex-col items-center justify-center gap-3 bg-black/80 pointer-events-auto"
                    >
                        <svg viewBox="0 0 24 24" className="size-10 text-white/50 fill-current">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                        </svg>
                        <p className="text-white/80 text-sm font-medium text-center px-6">{videoError}</p>
                        <button
                            className="mt-1 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
                            onClick={() => {
                                const v = videoRef.current;
                                if (!v) return;
                                v.load();
                            }}
                        >
                            Retry
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Cards overlay (clip wrapper keeps slide-in within player bounds) */}
            {showCards && !isMiniPlayer && cardsData && cardsData.cards.length > 0 && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-[25]">
                    <CardsPlayerOverlay
                        cards={cardsData.cards.map(c => ({
                            id: c.id,
                            postId: c.postId,
                            type: c.type as CardType,
                            title: c.title ?? "",
                            message: c.message ?? "",
                            url: c.url ?? "",
                            startTime: c.startTime,
                            duration: c.duration,
                            sortOrder: c.sortOrder,
                            isPersisted: true,
                        }))}
                        currentTime={currentTime}
                    />
                </div>
            )}

            {/* ── Custom caption overlay (YouTube ytp-caption-window style) ──── */}
            <AnimatePresence>
                {currentCue && !isMiniPlayer && (
                    <motion.div
                        key="caption"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.083, ease: [0.2, 0, 0, 1] }}
                        className="absolute z-[20] pointer-events-none"
                        style={{
                            bottom: showControls || isEnded ? 88 : 12,
                            left: "4.24%",
                            right: "4.24%",
                            transition: "bottom 0.25s cubic-bezier(0.2, 0, 0, 1)",
                            background: captionStyle.css.windowBackground,
                            padding: captionStyle.style.windowOpacity > 0 ? "4px 8px" : undefined,
                        }}
                    >
                        {currentCue
                            .replace(/<(?!\/?(?:b|i|u|em|strong)[> /])[^>]*>/g, "")
                            .split("\n")
                            .filter(Boolean)
                            .map((line, lineIdx) => (
                                <div key={lineIdx} style={{ display: "block", lineHeight: 1.5 }}>
                                    {line.split(" ").map((word, wordIdx, arr) => (
                                        <span
                                            key={wordIdx}
                                            style={{
                                                display: "inline",
                                                whiteSpace: "pre-wrap",
                                                background: captionStyle.css.background,
                                                fontSize: captionStyle.css.fontSize,
                                                color: captionStyle.css.color,
                                                fontFamily: captionStyle.css.fontFamily,
                                                fontVariant: captionStyle.css.fontVariant,
                                                textShadow: captionStyle.css.textShadow,
                                                padding: "2px 0",
                                                boxDecorationBreak: "clone",
                                                WebkitBoxDecorationBreak: "clone",
                                            }}
                                        >
                                            {word}{wordIdx < arr.length - 1 ? " " : ""}
                                        </span>
                                    ))}
                                </div>
                            ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── End screen (video cards + dark overlay) ───────────────────── */}
            {!isMiniPlayer && (
                <EndScreen isEnded={isEnded} postId={postId} />
            )}

            {/* ── Chrome overlay ────────────────────────────────────────────── */}
            {!isMiniPlayer && (
            <div className="absolute inset-0 z-[30] flex flex-col justify-end pointer-events-none overflow-hidden">

                {/* Bottom Chrome — slides up on show, slides down on hide */}
                <motion.div
                    animate={{
                        opacity: showControls || isEnded ? 1 : 0,
                        y: showControls || isEnded ? 0 : 16,
                    }}
                    transition={{
                        duration: showControls || isEnded ? 0.1 : 0.1,
                        ease: showControls || isEnded ? [0, 0, 0.2, 1] : [0.4, 0, 1, 1],
                    }}
                    style={{ pointerEvents: showControls || isEnded ? "auto" : "none" }}
                >
                <ControlsBar
                    timelineRef={timelineRef}
                    hoverPercent={hoverPercent}
                    setHoverPercent={setHoverPercent}
                    isScrubbing={isScrubbing}
                    isScrubbingRef={isScrubbingRef}
                    isFineScrubbing={isFineScrubbing}
                    setIsFineScrubbing={setIsFineScrubbing}
                    currentTime={currentTime}
                    duration={duration}
                    buffered={buffered}
                    thumbDataUrl={thumbDataUrl}
                    vttThumb={vttThumb}
                    heatmapBuckets={heatmapBuckets}
                    thumbnailUrl={thumbnailUrl}
                    chapters={chapters}
                    progressDots={[...progressDots, ...ads.adCuePoints.map(t => ({ time: t, label: "Ad break" }))]}
                    markers={markers}
                    isWaiting={isWaiting}
                    seekThumb={seekThumb}
                    wasPausedRef={wasPausedRef}
                    videoRef={videoRef}
                    setCurrentTime={setCurrentTime}
                    setIsScrubbing={setIsScrubbing}
                    formatTime={formatTime}
                    getChapterAtTime={getChapterAtTime}
                    isEnded={isEnded}
                    isPlaying={isPlaying}
                    loop={loop}
                    toggleLoop={toggleLoop}
                    videoUrl={videoUrl}
                    togglePlay={togglePlay}
                    onReplay={() => {
                        const video = videoRef.current;
                        if (!video) return;
                        video.currentTime = 0;
                        void video.play();
                    }}
                    volumeLevel={volumeLevel}
                    toggleMute={toggleMute}
                    volume={volume}
                    isMuted={isMuted}
                    volumeTrackRef={volumeTrackRef}
                    adjustVolume={adjustVolume}
                    isDraggingVolumeRef={isDraggingVolumeRef}
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
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
                    autoplay={autoplay}
                    setAutoplay={setAutoplay}
                    isFullscreen={isFullscreen}
                    toggleFullscreen={toggleFullscreen}
                    isTheaterMode={isTheaterMode}
                    toggleTheaterMode={toggleTheaterMode}
                    airplayAvailable={airplayAvailable}
                    onEnterMiniPlayer={onEnterMiniPlayer}
                    show={show}
                    speedLabel={speedLabel}
                    isLive={isLive}
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
                </motion.div>
            </div>
            )}

            {/* ── Bezel — wrapper hidden by default, circle carries the animation ── */}
            {!isMiniPlayer && (
                <Bezel
                    wrapRef={bezelWrapRef}
                    circleRef={bezelCircleRef}
                    icon={bezelIcon}
                />
            )}

            {/* ── Mini player overlay ───────────────────────────────────────── */}
            {isMiniPlayer && (
                <MiniPlayerOverlay
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    bufferedFraction={duration ? buffered / duration : 0}
                    thumbDataUrl={thumbDataUrl}
                    thumbnailUrl={thumbnailUrl}
                    formatTime={formatTime}
                    onTogglePlay={() => void togglePlay()}
                    onSeek={(frac) => {
                        const video = videoRef.current;
                        if (!video) return;
                        const t = frac * (video.duration || 0);
                        video.currentTime = t;
                        setCurrentTime(t);
                    }}
                    onClose={onMiniPlayerClose}
                    onExpand={onMiniPlayerExpand}
                />
            )}

            {/* Click-outside to close any open menu */}
            {openMenu && (
                <div className="absolute inset-0 z-[29]" onClick={() => setOpenMenu(null)} />
            )}

            {/* Click-outside to dismiss fine scrubbing */}
            {isFineScrubbing && (
                <div className="absolute inset-0 z-[25]" onClick={() => setIsFineScrubbing(false)} />
            )}

        </div>
    );
}
