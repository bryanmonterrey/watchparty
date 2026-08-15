"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import { useAmbientGlow, AMBIENT_PRESET } from "@/hooks/use-ambient-glow";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useAds } from "./use-ads";
import { usePreviewThumbnails } from "./use-preview-thumbnails";
import {
    PLAYBACK_RATES,
    store,
    type BezelIcon,
    type OpenMenu,
    type VideoPlayerProps,
} from "./types";
import { useCaptionStyle } from "./use-caption-style";
import { useAudioProcessor } from "./use-audio-processor";
import { useAudioBus } from "./use-audio-bus";
import { useFrameThumbnails } from "./use-frame-thumbnails";

export function usePlayer(props: VideoPlayerProps) {
    const {
        postId,
        videoUrl,
        thumbnailUrl,
        isLoading,
        loop: loopProp,
        chapters = [],
        progressDots: _progressDots = [],
        autoPlay = false,
        audioBus = false,
        theaterMode,
        onEnded: onEndedProp,
        onTheaterModeChange,
        onBeforePlay,
        hiddenControls = [],
        isMiniPlayer: _isMiniPlayer = false,
        onEnterMiniPlayer,
        onMiniPlayerClose: _onMiniPlayerClose,
        onMiniPlayerExpand: _onMiniPlayerExpand,
        adTagUrl,
        thumbnailVttUrls,
    } = props;

    // ── Refs ──────────────────────────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wasPausedRef = useRef(false);
    // ref (not state) so timeupdate handler always reads the latest value without re-renders
    const isScrubbingRef = useRef(false);
    const isDraggingVolumeRef = useRef(false);
    const volumeTrackRef = useRef<HTMLDivElement>(null);
    const viewIncremented = useRef(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hlsRef = useRef<any>(null);

    // ── Playback state ────────────────────────────────────────────────────────
    const [isPlaying, setIsPlaying] = useState(false);
    const [isStarted, setIsStarted] = useState(false);
    const [isEnded, setIsEnded] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [autoplay, setAutoplay] = useState(() => store.get("ytp-autoplay", "1") !== "0");
    useEffect(() => { store.set("ytp-autoplay", autoplay ? "1" : "0"); }, [autoplay]);
    const [playbackRate, setPlaybackRate] = useState(() =>
        parseFloat(store.get("ytp-rate", "1"))
    );

    // ── Volume state ──────────────────────────────────────────────────────────
    const [volume, setVolume] = useState(() =>
        parseFloat(store.get("ytp-volume", "1"))
    );
    const [isMuted, setIsMuted] = useState(false);

    // ── View-mode state ───────────────────────────────────────────────────────
    const [isFullscreen, setIsFullscreen] = useState(false);
    // Seeded from the prop and re-synced below when it's supplied, so a host that
    // owns the layout (home's focus mode) can't drift out of step with the button.
    const [isTheaterMode, setIsTheaterMode] = useState(theaterMode ?? false);
    useEffect(() => {
        if (theaterMode !== undefined) setIsTheaterMode(theaterMode);
    }, [theaterMode]);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [showControls, setShowControls] = useState(true);
    const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
    const [bezelIcon, setBezelIcon] = useState<BezelIcon>("play");
    const bezelWrapRef = useRef<HTMLDivElement>(null);
    const bezelCircleRef = useRef<HTMLDivElement>(null);
    const [airplayAvailable, setAirplayAvailable] = useState(false);

    // ── Touch detection ───────────────────────────────────────────────────────
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    useEffect(() => {
        const onTouch = () => setIsTouchDevice(true);
        window.addEventListener("touchstart", onTouch, { once: true, passive: true });
        return () => window.removeEventListener("touchstart", onTouch);
    }, []);

    // ── Scrubber state ────────────────────────────────────────────────────────
    const timelineRef = useRef<HTMLDivElement>(null);
    const [buffered, setBuffered] = useState(0);
    const [hoverPercent, setHoverPercent] = useState<number | null>(null);
    // isScrubbing as state (not just ref) so CSS transition toggles correctly on re-render
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [isFineScrubbing, setIsFineScrubbing] = useState(false);

    // ── Post-seek controls grace period ──────────────────────────────────────
    const lastSeekTimeRef = useRef(0);

    // ── Thumbnail capture (detached video + canvas) ───────────────────────────
    const { thumbDataUrl, seekThumb } = useFrameThumbnails(videoUrl);

    // ── Buffering / error state ───────────────────────────────────────────────
    const [isWaiting, setIsWaiting] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);
    // 250ms delay before adding loading class — prevents flicker on brief stalls
    const [isLoadingClass, setIsLoadingClass] = useState(false);
    const loadingClassTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (isWaiting) {
            loadingClassTimerRef.current = setTimeout(() => setIsLoadingClass(true), 250);
        } else {
            if (loadingClassTimerRef.current) clearTimeout(loadingClassTimerRef.current);
            setIsLoadingClass(false);
        }
        return () => { if (loadingClassTimerRef.current) clearTimeout(loadingClassTimerRef.current); };
    }, [isWaiting]);

    // ── Progress persistence ──────────────────────────────────────────────────
    const { data: session } = useAuthSession();
    const saveProgressThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resumeAppliedRef = useRef(false);

    // ── Loop state ────────────────────────────────────────────────────────────
    // The prop is a starting value, not a lock: a caller with one video and
    // nowhere to advance to (the home hero on a one-item feed) opens looping,
    // and the toggle still works from there.
    const [loop, setLoop] = useState(() => loopProp ?? store.get("ytp-loop", "0") === "1");

    // ── Caption style ─────────────────────────────────────────────────────────
    const captionStyle = useCaptionStyle();

    // ── Ambient mode ──────────────────────────────────────────────────────────
    const [ambientMode, setAmbientMode] = useState(() => store.get("ytp-ambient", "1") !== "0");
    const toggleAmbientMode = useCallback(() => {
        setAmbientMode(prev => {
            const next = !prev;
            store.set("ytp-ambient", next ? "1" : "0");
            return next;
        });
    }, []);

    // ── Audio processor ───────────────────────────────────────────────────────
    const audioProcessor = useAudioProcessor(videoRef);

    // ── Scrubber color variant ────────────────────────────────────────────────
    const [scrubberRainbow, setScrubberRainbow] = useState(
        () => store.get("ytp-scrubber-rainbow", "0") === "1"
    );
    const toggleScrubberRainbow = useCallback(() => {
        setScrubberRainbow(prev => {
            const next = !prev;
            store.set("ytp-scrubber-rainbow", next ? "1" : "0");
            return next;
        });
    }, []);

    // ── Caption cue state (custom overlay) ───────────────────────────────────
    const [currentCue, setCurrentCue] = useState<string | null>(null);
    const activeCueTrackRef = useRef<TextTrack | null>(null);

    // ── Media-track / quality state ───────────────────────────────────────────
    const [textTracks, setTextTracks] = useState<Array<{ label: string; index: number }>>([]);
    const [selectedTrack, setSelectedTrack] = useState(() =>
        parseInt(store.get("ytp-subtitles", "-1"))
    );
    const [audioTracks, setAudioTracks] = useState<Array<{ label: string; id: number }>>([]);
    const [selectedAudio, setSelectedAudio] = useState(0);
    const [qualities, setQualities] = useState<Array<{ label: string; level: number }>>([]);
    const [selectedQuality, setSelectedQuality] = useState(-1);

    const incrementView = trpc.content.incrementView.useMutation();
    const saveProgressMutation = trpc.content.saveProgress.useMutation();
    const { data: progressData } = trpc.content.getProgress.useQuery(
        { postId },
        { enabled: !!session?.user, staleTime: Infinity }
    );

    const { data: heatmapData } = trpc.content.getHeatmap.useQuery(
        { postId },
        { staleTime: 60_000 }
    );
    const heatmapBuckets = heatmapData?.buckets ?? [];
    const recordHeatmap = trpc.content.recordHeatmap.useMutation();
    const recordedBucketsRef = useRef<Set<number>>(new Set());

    // ── Caption tracks from DB ────────────────────────────────────────────────
    // Poll every 12s until captions arrive (Deepgram job runs in background after upload)
    const { data: captionsData } = trpc.content.getCaptions.useQuery(
        { postId },
        {
            // Never re-fetch once we have captions — avoids disrupting oncuechange
            staleTime: Infinity,
            // …and give up after ~10 minutes of silence. The poll exists for the
            // minutes after an upload, while Deepgram works; past that the video
            // simply has no captions and asking again forever is a request every
            // 12s for as long as the player stays mounted. That bill lands on
            // home, where the hero autoplays and people sit.
            refetchInterval: (query) =>
                (query.state.data?.captions?.length ?? 0) > 0 || query.state.dataUpdateCount > 50
                    ? false
                    : 12_000,
        }
    );
    const captionTracks = captionsData?.captions ?? [];

    // ── VTT sprite-sheet thumbnail previews ───────────────────────────────────
    const hoverTime = hoverPercent !== null ? hoverPercent * duration : null;
    const vttThumb = usePreviewThumbnails(thumbnailVttUrls, hoverTime);

    // ── Ads (Google IMA SDK) ──────────────────────────────────────────────────
    const ads = useAds({
        containerRef,
        videoRef,
        adTagUrl,
        volume,
        isMuted,
        onContentPause: () => { videoRef.current?.pause(); },
        onContentResume: () => {
            if (!wasPausedRef.current) void videoRef.current?.play();
        },
    });

    // Home's preset, not this player's old brightness-1.5 wash — same glow
    // everywhere. Still behind the ambientMode toggle (persisted, default on).
    useAmbientGlow(videoRef, AMBIENT_PRESET, !isLoading && ambientMode);

    // ── Bezel helper — matches YouTube: wrapper display:none ↔ "", circle animated ──
    const showBezel = useCallback((icon: BezelIcon) => {
        // flushSync so the correct icon is in the DOM before we make it visible
        flushSync(() => setBezelIcon(icon));
        const wrap = bezelWrapRef.current;
        const circle = bezelCircleRef.current;
        if (!wrap || !circle) return;
        wrap.style.display = "flex";
        circle.getAnimations().forEach(a => a.cancel());
        const anim = circle.animate(
            [
                { opacity: 0, transform: "scale(1)" },
                { opacity: 1, transform: "scale(2)", offset: 0.25 },
                { opacity: 1, transform: "scale(2)", offset: 0.75 },
                { opacity: 0, transform: "scale(1)" },
            ],
            { duration: 1000, easing: "linear", fill: "forwards" }
        );
        anim.onfinish = () => {
            wrap.style.display = "none";
            circle.getAnimations().forEach(a => a.cancel()); // clear fill:forwards
        };
    }, []);

    // ── Controls visibility ───────────────────────────────────────────────────
    const hideControls = useCallback(() => {
        const msSinceSeek = Date.now() - lastSeekTimeRef.current;
        if (isPlaying && !isScrubbingRef.current && !openMenu && !isFineScrubbing && msSinceSeek > 2000) {
            setShowControls(false);
        }
    }, [isPlaying, openMenu, isFineScrubbing]);

    const resetControlsTimeout = useCallback(() => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(hideControls, 3000);
    }, [hideControls]);
    // Stable ref so the keyboard useEffect never needs resetControlsTimeout in its deps
    const resetControlsTimeoutRef = useRef(resetControlsTimeout);
    resetControlsTimeoutRef.current = resetControlsTimeout;

    // Close settings menu when clicking anywhere outside the player container
    useEffect(() => {
        if (!openMenu) return;
        const onPointerDown = (e: PointerEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [openMenu]);

    useEffect(() => {
        const onMove = () => resetControlsTimeout();
        const onLeave = () => { if (!openMenu) setShowControls(false); };
        const el = containerRef.current;
        if (!el) return;
        el.addEventListener("mousemove", onMove);
        el.addEventListener("mouseleave", onLeave);
        return () => {
            el.removeEventListener("mousemove", onMove);
            el.removeEventListener("mouseleave", onLeave);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        };
    }, [resetControlsTimeout, openMenu]);

    // ── AirPlay detection ─────────────────────────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !("WebKitPlaybackTargetAvailabilityEvent" in window)) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onAvail = (e: Event) => setAirplayAvailable((e as any).availability === "available");
        video.addEventListener("webkitplaybacktargetavailabilitychanged", onAvail);
        return () => video.removeEventListener("webkitplaybacktargetavailabilitychanged", onAvail);
    }, []);

    // ── HLS streaming setup ───────────────────────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !videoUrl) return;

        hlsRef.current?.destroy();
        hlsRef.current = null;

        const savedVolume = parseFloat(store.get("ytp-volume", "1"));
        const savedRate = parseFloat(store.get("ytp-rate", "1"));

        if (videoUrl.includes(".m3u8")) {
            import("hls.js").then(({ default: Hls }) => {
                if (!Hls.isSupported()) { video.src = videoUrl; return; }
                const hls = new Hls({ autoStartLoad: true });
                hlsRef.current = hls;
                hls.loadSource(videoUrl);
                hls.attachMedia(video);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                hls.on(Hls.Events.MANIFEST_PARSED, (_: unknown, data: any) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const levels = data.levels.map((l: any, i: number) => {
                        const res = l.height ? `${l.height}p` : `Level ${i + 1}`;
                        const kbps = l.bitrate ? Math.round(l.bitrate / 1000) : null;
                        const bitrateStr = kbps
                            ? kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`
                            : null;
                        return { label: bitrateStr ? `${res} · ${bitrateStr}` : res, level: i };
                    });
                    setQualities([{ label: "Auto", level: -1 }, ...levels]);
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_: unknown, data: any) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setAudioTracks(data.audioTracks.map((t: any) => ({
                        label: t.name || t.lang || `Track ${t.id}`,
                        id: t.id,
                    })));
                    setSelectedAudio(hls.audioTrack >= 0 ? hls.audioTrack : 0);
                });
                video.volume = savedVolume;
                video.playbackRate = savedRate;
            });
        } else {
            // Native: MP4, WebM, or browser-native DASH
            video.src = videoUrl;
            video.volume = savedVolume;
            video.playbackRate = savedRate;
        }

        return () => { hlsRef.current?.destroy(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoUrl]);

    // ── Autoplay + page audio bus ─────────────────────────────────────────────
    // Both inert unless asked for, and declared HERE — after the effect that
    // sets the source — because autoplay starts the element the moment it can.
    const { noteUserMuted } = useAudioBus({
        enabled: audioBus,
        autoPlay,
        videoRef,
        videoUrl,
        isPlaying,
        setIsMuted,
    });

    // ── Text-track detection (runs on metadata load AND when DB captions change) ─
    const syncTextTracks = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        const tracks = Array.from(video.textTracks).map((t, i) => ({
            label: t.label || t.language || `Track ${i + 1}`,
            language: t.language || undefined,
            index: i,
        }));
        setTextTracks(tracks);
        const saved = parseInt(store.get("ytp-subtitles", "-1"));
        // Only assign mode if it's actually changing — reassigning the same mode
        // can cause browsers to reload the track and kill the oncuechange handler
        Array.from(video.textTracks).forEach((t, i) => {
            const next = i === saved ? "hidden" : "disabled";
            if (t.mode !== next) t.mode = next;
        });
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.addEventListener("loadedmetadata", syncTextTracks);
        return () => video.removeEventListener("loadedmetadata", syncTextTracks);
    }, [videoUrl, syncTextTracks]);

    // Re-sync whenever DB caption tracks are injected into the DOM (they appear
    // as new <track> elements slightly after the video element renders).
    // Auto-enable the first track if the user has never set a preference.
    useEffect(() => {
        if (captionTracks.length === 0) return;
        const video = videoRef.current;

        const autoEnable = () => {
            const saved = parseInt(store.get("ytp-subtitles", "-1"));
            if (!video || video.textTracks.length === 0) { syncTextTracks(); return; }
            // Always use setSubtitleTrack so the oncuechange listener gets attached.
            // saved >= 0 → restore saved track; -1 → auto-enable first track.
            const idx = saved >= 0 && saved < video.textTracks.length ? saved : 0;
            setSubtitleTrack(idx);
        };

        const timer = setTimeout(autoEnable, 500);
        const onAddTrack = () => { clearTimeout(timer); autoEnable(); };
        video?.textTracks.addEventListener("addtrack", onAddTrack);
        return () => {
            clearTimeout(timer);
            video?.textTracks.removeEventListener("addtrack", onAddTrack);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [captionTracks, syncTextTracks]);

    // ── View-increment ────────────────────────────────────────────────────────
    useEffect(() => {
        if (isPlaying && !viewIncremented.current) {
            viewIncremented.current = true;
            incrementView.mutate({ postId, contentType: "video" });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, postId]);

    // ── Resume from saved position ────────────────────────────────────────────
    // Apply once when metadata is loaded AND progressData is available
    useEffect(() => {
        if (resumeAppliedRef.current) return;
        const video = videoRef.current;
        if (!video || !progressData) return;

        const savedTime = session?.user
            ? progressData.currentTime
            : parseFloat(store.get(`ytp-progress-${postId}`, "0"));

        if (savedTime > 5) {
            const applyResume = () => {
                if (resumeAppliedRef.current) return;
                resumeAppliedRef.current = true;
                video.currentTime = savedTime;
                setCurrentTime(savedTime);
            };
            if (video.readyState >= 1) {
                applyResume();
            } else {
                const onMeta = () => { applyResume(); video.removeEventListener("loadedmetadata", onMeta); };
                video.addEventListener("loadedmetadata", onMeta);
            }
        } else {
            resumeAppliedRef.current = true;
        }
    }, [progressData, postId, session?.user]);

    // Reset resume gate and recorded heatmap buckets when postId changes
    useEffect(() => {
        resumeAppliedRef.current = false;
        recordedBucketsRef.current = new Set();
    }, [postId]);

    // ── Native event sync ─────────────────────────────────────────────────────
    // Fullscreen synced from event (fixes ESC key breaking state — Griffith pattern)
    useEffect(() => {
        const onFS = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFS);
        document.addEventListener("webkitfullscreenchange", onFS);
        return () => {
            document.removeEventListener("fullscreenchange", onFS);
            document.removeEventListener("webkitfullscreenchange", onFS);
        };
    }, []);

    // Volume synced from native event — volumechange is the source of truth (vanilla clone pattern)
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onVol = () => {
            setIsMuted(video.muted || video.volume === 0);
            setVolume(video.volume);
        };
        video.addEventListener("volumechange", onVol);
        return () => video.removeEventListener("volumechange", onVol);
    }, []);

    // Document-level pointer handlers for scrubbing outside the timeline element.
    // NOTE: play/pause on scrub-end is intentionally omitted here — the Scrubber's
    // own onUp handler owns that logic (it accounts for fine-scrub snap-open state).
    useEffect(() => {
        const onUp = () => {
            if (!isScrubbingRef.current) return;
            isScrubbingRef.current = false;
            setIsScrubbing(false);
            setHoverPercent(null);
        };
        const onMove = (e: PointerEvent) => {
            if (!isScrubbingRef.current) return;
            const rect = timelineRef.current?.getBoundingClientRect();
            if (!rect || !videoRef.current) return;
            const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            setHoverPercent(pct);
            const t = pct * (videoRef.current.duration || 0);
            setCurrentTime(t);
            videoRef.current.currentTime = t;
            seekThumb(t);
        };
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointermove", onMove);
        return () => {
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointermove", onMove);
        };
    }, [seekThumb]);

    // ── Playback actions ──────────────────────────────────────────────────────
    const togglePlay = useCallback(async () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            if (onBeforePlay) await onBeforePlay();
            ads.initAds(); // no-op if already initialized or no adTagUrl
            await video.play();
            showBezel("play");
        } else {
            video.pause();
            showBezel("pause");
        }
        resetControlsTimeout();
    }, [resetControlsTimeout, onBeforePlay, showBezel, ads]);

    const skip = useCallback((seconds: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
        lastSeekTimeRef.current = Date.now();
        showBezel(seconds > 0 ? "forward" : "back");
        resetControlsTimeout();
    }, [resetControlsTimeout, showBezel]);

    // ── Media Session API (lock screen / headphone controls) ─────────────────
    useEffect(() => {
        if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: props.title ?? "Video",
            artwork: props.thumbnailUrl ? [{ src: props.thumbnailUrl, sizes: "512x512", type: "image/jpeg" }] : [],
        });
    }, [props.title, props.thumbnailUrl]);

    useEffect(() => {
        if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
        navigator.mediaSession.setActionHandler("play", () => void togglePlay());
        navigator.mediaSession.setActionHandler("pause", () => void togglePlay());
        navigator.mediaSession.setActionHandler("seekbackward", () => skip(-10));
        navigator.mediaSession.setActionHandler("seekforward", () => skip(10));
        return () => {
            navigator.mediaSession.setActionHandler("play", null);
            navigator.mediaSession.setActionHandler("pause", null);
            navigator.mediaSession.setActionHandler("seekbackward", null);
            navigator.mediaSession.setActionHandler("seekforward", null);
        };
    }, [togglePlay, skip]);

    const cyclePlaybackRate = useCallback((dir: 1 | -1 = 1) => {
        const video = videoRef.current;
        if (!video) return;
        const idx = PLAYBACK_RATES.indexOf(playbackRate);
        const next = PLAYBACK_RATES[Math.max(0, Math.min(PLAYBACK_RATES.length - 1, idx + dir))];
        video.playbackRate = next;
        setPlaybackRate(next);
        store.set("ytp-rate", String(next));
    }, [playbackRate]);

    const setRate = useCallback((rate: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.playbackRate = rate;
        setPlaybackRate(rate);
        store.set("ytp-rate", String(rate));
    }, []);

    const toggleTheaterMode = useCallback(() => {
        setIsTheaterMode(prev => { onTheaterModeChange?.(!prev); return !prev; });
    }, [onTheaterModeChange]);

    const toggleFullscreen = useCallback(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = document as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const el = containerRef.current as any;
        if (!el) return;

        // iOS Safari: no native fullscreen for <div>; use CSS fallback
        const isIOS = typeof navigator !== "undefined" &&
            /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
        if (isIOS) {
            setIsFullscreen(prev => {
                const next = !prev;
                if (next) {
                    el.classList.add("ytp-fullscreen");
                    document.body.style.overflow = "hidden";
                    // Inject viewport-fit=cover for notch support
                    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
                    if (meta && !meta.content.includes("viewport-fit=cover")) {
                        meta.content += ", viewport-fit=cover";
                    }
                } else {
                    el.classList.remove("ytp-fullscreen");
                    document.body.style.overflow = "";
                }
                return next;
            });
            return;
        }

        if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
            el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.();
        } else {
            document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.();
        }
    }, []);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        const newMuted = !video.muted;
        video.muted = newMuted;
        noteUserMuted(newMuted);
        setIsMuted(newMuted || video.volume === 0);
    }, [noteUserMuted]);

    const adjustVolume = useCallback((val: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.volume = val;
        video.muted = val === 0;
        noteUserMuted(val === 0);
        setVolume(val);
        setIsMuted(val === 0);
        store.set("ytp-volume", String(val));
    }, [noteUserMuted]);

    // Document-level pointer handlers for volume drag
    useEffect(() => {
        const onUp = () => { isDraggingVolumeRef.current = false; };
        const onMove = (e: PointerEvent) => {
            if (!isDraggingVolumeRef.current) return;
            const rect = volumeTrackRef.current?.getBoundingClientRect();
            if (!rect) return;
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            adjustVolume(pct);
        };
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointermove", onMove);
        return () => {
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointermove", onMove);
        };
    }, [adjustVolume]);

    const toggleLoop = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        const next = !video.loop;
        video.loop = next;
        setLoop(next);
        store.set("ytp-loop", next ? "1" : "0");
    }, []);

    // Sync loop state to video on mount / when videoUrl changes
    useEffect(() => {
        const video = videoRef.current;
        if (video) video.loop = loop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoUrl]);

    const setQuality = useCallback((level: number) => {
        if (hlsRef.current) hlsRef.current.currentLevel = level;
        setSelectedQuality(level);
        setOpenMenu(null);
    }, []);

    const setAudioTrack = useCallback((id: number) => {
        if (hlsRef.current) hlsRef.current.audioTrack = id;
        setSelectedAudio(id);
        setOpenMenu(null);
    }, []);

    const setSubtitleTrack = useCallback((index: number) => {
        const video = videoRef.current;
        if (!video) return;
        // Detach previous cuechange listener
        if (activeCueTrackRef.current) {
            activeCueTrackRef.current.oncuechange = null;
            activeCueTrackRef.current = null;
        }
        setCurrentCue(null);
        Array.from(video.textTracks).forEach((t, i) => {
            t.mode = i === index ? "hidden" : "disabled";
        });
        if (index >= 0) {
            const track = video.textTracks[index];
            if (track) {
                activeCueTrackRef.current = track;
                const syncCue = () => {
                    const cue = track.activeCues?.[0] as VTTCue | undefined;
                    setCurrentCue(cue?.text ?? null);
                };
                track.oncuechange = syncCue;
                // Immediately sync in case cues are already loaded and active
                syncCue();
            }
        }
        setSelectedTrack(index);
        store.set("ytp-subtitles", String(index));
        setOpenMenu(null);
    }, []);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = document.activeElement as HTMLElement | null;
            const tag = el?.tagName?.toLowerCase();
            const role = el?.getAttribute("role");
            if (tag === "input" || tag === "textarea" || tag === "select") return;
            if (el?.contentEditable === "true") return;
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            // Space on a button/menuitem triggers that element — don't also toggle play
            if (e.key === " " && (tag === "button" || tag === "a" || role === "menuitem" || role === "menuitemradio")) return;

            // Focus trap: when fullscreen, Tab cycles through player controls only
            if (e.key === "Tab" && isFullscreen) {
                e.preventDefault();
                const container = containerRef.current;
                if (container) {
                    const focusable = Array.from(container.querySelectorAll<HTMLElement>(
                        'button:not([disabled]), [tabindex="0"], a[href]'
                    )).filter(el => el.offsetParent !== null);
                    if (focusable.length) {
                        const idx = focusable.indexOf(document.activeElement as HTMLElement);
                        const next = e.shiftKey
                            ? (idx - 1 + focusable.length) % focusable.length
                            : (idx + 1) % focusable.length;
                        focusable[next]?.focus();
                    }
                }
                return;
            }

            switch (e.key) {
                case " ": case "k": case "K":
                    e.preventDefault(); void togglePlay(); break;
                case "f": case "F":
                    toggleFullscreen(); resetControlsTimeoutRef.current(); break;
                case "t": case "T":
                    toggleTheaterMode(); resetControlsTimeoutRef.current(); break;
                case "i": case "I":
                    onEnterMiniPlayer?.(videoRef.current?.currentTime ?? 0); break;
                case "m": case "M":
                    toggleMute(); resetControlsTimeoutRef.current(); break;
                case "c": case "C":
                    if (textTracks.length > 0) { setSubtitleTrack(selectedTrack === -1 ? 0 : -1); resetControlsTimeoutRef.current(); }
                    break;
                case "j": case "J": case "ArrowLeft":
                    e.preventDefault(); skip(-5); break;
                case "l": case "L": case "ArrowRight":
                    e.preventDefault(); skip(5); break;
                case "ArrowUp":
                    e.preventDefault(); adjustVolume(Math.min(1, volume + 0.05)); resetControlsTimeoutRef.current(); break;
                case "ArrowDown":
                    e.preventDefault(); adjustVolume(Math.max(0, volume - 0.05)); resetControlsTimeoutRef.current(); break;
                case "<": cyclePlaybackRate(-1); resetControlsTimeoutRef.current(); break;
                case ">": cyclePlaybackRate(1); resetControlsTimeoutRef.current(); break;
                default: {
                    const digit = parseInt(e.key);
                    if (!isNaN(digit) && e.key >= "0" && e.key <= "9") {
                        const video = videoRef.current;
                        if (video && video.duration) {
                            e.preventDefault();
                            video.currentTime = (digit / 10) * video.duration;
                            setCurrentTime(video.currentTime);
                            lastSeekTimeRef.current = Date.now();
                            resetControlsTimeoutRef.current();
                        }
                    }
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [togglePlay, toggleFullscreen, toggleMute, toggleTheaterMode, onEnterMiniPlayer,
        skip, adjustVolume, volume, cyclePlaybackRate, textTracks, selectedTrack, setSubtitleTrack]);

    // ── Utilities ─────────────────────────────────────────────────────────────
    const formatTime = useCallback((seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0 || duration >= 3600) {
            return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
        }
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }, [duration]);

    const getChapterAtTime = useCallback((t: number) =>
        chapters.find(c => t >= c.startTime && t < c.endTime),
    [chapters]);

    // ── Derived values ────────────────────────────────────────────────────────
    const volumeLevel: "muted" | "low" | "high" = isMuted || volume === 0 ? "muted" : volume < 0.5 ? "low" : "high";
    const speedLabel = playbackRate === 1 ? "HD" : `${playbackRate}x`;
    const show = (ctrl: string) => !hiddenControls.includes(ctrl as ("pip" | "theater" | "subtitles" | "settings" | "autoplay" | "airplay"));
    const isLive = duration === Infinity || (!isNaN(duration) && duration > 0 && duration >= 2 ** 32);

    // ── Video event handlers (returned so main component can attach them) ──────
    const onTimeUpdate = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (!isScrubbingRef.current) setCurrentTime(video.currentTime);
        ads.updateLastTime(video.currentTime);

        // Sync caption cue on every tick — reliable fallback for when oncuechange
        // misses the initial cue because the VTT file hadn't finished loading yet
        // when the listener was attached. Only triggers a re-render when text changes.
        if (activeCueTrackRef.current) {
            const cue = activeCueTrackRef.current.activeCues?.[0] as VTTCue | undefined;
            const next = cue?.text ?? null;
            setCurrentCue(prev => prev === next ? prev : next);
        }

        // Keep lock-screen scrubber in sync
        if ("mediaSession" in navigator && video.duration && isFinite(video.duration)) {
            try {
                navigator.mediaSession.setPositionState?.({
                    duration: video.duration,
                    position: Math.min(video.currentTime, video.duration),
                    playbackRate: video.playbackRate,
                });
            } catch { /* ignore if not supported */ }
        }

        // Record heatmap hit for this 5-second bucket (once per session per bucket)
        if (!isScrubbingRef.current) {
            const bucket = Math.floor(video.currentTime / 5);
            if (!recordedBucketsRef.current.has(bucket)) {
                recordedBucketsRef.current.add(bucket);
                recordHeatmap.mutate({ postId, bucket });
            }
        }

        // Throttled progress save: every 5s
        if (!saveProgressThrottleRef.current) {
            saveProgressThrottleRef.current = setTimeout(() => {
                saveProgressThrottleRef.current = null;
                const t = video.currentTime;
                if (t > 5) {
                    if (session?.user) {
                        saveProgressMutation.mutate({ postId, currentTime: t });
                    } else {
                        store.set(`ytp-progress-${postId}`, String(t));
                    }
                }
            }, 5000);
        }
    }, [session?.user, postId, saveProgressMutation]);

    const onLoadedMetadata = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        setDuration(video.duration);
        video.volume = parseFloat(store.get("ytp-volume", "1"));
        video.playbackRate = parseFloat(store.get("ytp-rate", "1"));
    }, []);

    const onPlay = useCallback(() => {
        setIsPlaying(true);
        setIsStarted(true);
        setIsEnded(false);
        setIsWaiting(false);
    }, []);

    const onPause = useCallback(() => setIsPlaying(false), []);

    const onEnded = useCallback(() => {
        setIsPlaying(false);
        setIsEnded(true);
        setShowControls(true);
        ads.onVideoEnded();
        // Clear saved progress so next watch starts from beginning
        if (session?.user) saveProgressMutation.mutate({ postId, currentTime: 0 });
        else store.set(`ytp-progress-${postId}`, "0");
        // Last, so a host that swaps the source on this (the home hero advancing
        // its queue) does it against a settled player.
        onEndedProp?.();
    }, [session?.user, postId, saveProgressMutation, ads, onEndedProp]);

    const onWaiting = useCallback(() => setIsWaiting(true), []);
    const onCanPlay = useCallback(() => { setIsWaiting(false); setVideoError(null); }, []);
    const onCanPlayThrough = useCallback(() => { setIsWaiting(false); setVideoError(null); }, []);

    const onProgress = useCallback(() => {
        const v = videoRef.current;
        if (v?.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    }, []);

    const onError = useCallback(() => {
        const v = videoRef.current;
        const code = v?.error?.code;
        const msg = code === 1 ? "Playback aborted"
            : code === 2 ? "Network error — check your connection"
            : code === 3 ? "Video file is corrupted"
            : code === 4 ? "Video format not supported"
            : "Failed to load video";
        setVideoError(msg);
        setIsWaiting(false);
    }, []);

    return {
        // Refs
        containerRef,
        videoRef,
        wasPausedRef,
        isScrubbingRef,
        isDraggingVolumeRef,
        volumeTrackRef,
        bezelWrapRef,
        bezelCircleRef,
        timelineRef,
        // State
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
        setShowControls,
        openMenu,
        setOpenMenu,
        bezelIcon,
        airplayAvailable,
        buffered,
        setBuffered,
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
        scrubberRainbow,
        toggleScrubberRainbow,
        ambientMode,
        toggleAmbientMode,
        captionStyle,
        ...audioProcessor,
        currentCue,
        captionTracks,
        textTracks,
        selectedTrack,
        audioTracks,
        selectedAudio,
        qualities,
        selectedQuality,
        // Callbacks
        togglePlay,
        toggleLoop,
        skip,
        cyclePlaybackRate,
        setRate,
        toggleTheaterMode,
        toggleFullscreen,
        toggleMute,
        adjustVolume,
        setQuality,
        setAudioTrack,
        setSubtitleTrack,
        seekThumb,
        showBezel,
        resetControlsTimeout,
        // Utilities
        formatTime,
        getChapterAtTime,
        // Derived
        volumeLevel,
        speedLabel,
        show,
        isLive,
        isTouchDevice,
        // Ads
        ads,
        // Video event handlers
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
    };
}
