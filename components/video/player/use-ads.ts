"use client";

import { useRef, useCallback, useState, useEffect } from "react";

/* global google */
declare global {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interface Window { google?: any }
}

const IMA_SDK_URL = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
const SAFETY_TIMEOUT_MS = 12_000;

function loadImaScript(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (window.google?.ima) { resolve(); return; }
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${IMA_SDK_URL}"]`);
        if (existing) {
            if ((existing as HTMLScriptElement & { _loaded?: boolean })._loaded) { resolve(); return; }
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () => reject(new Error("IMA SDK failed to load")));
            return;
        }
        const s = document.createElement("script");
        s.src = IMA_SDK_URL;
        s.async = true;
        s.onload = () => { (s as HTMLScriptElement & { _loaded?: boolean })._loaded = true; resolve(); };
        s.onerror = () => reject(new Error("IMA SDK failed to load"));
        document.head.appendChild(s);
    });
}

function formatAdTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface UseAdsOptions {
    containerRef: React.RefObject<HTMLDivElement | null>;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    adTagUrl: string | null | undefined;
    volume: number;
    isMuted: boolean;
    onContentPause: () => void;
    onContentResume: () => void;
}

export interface UseAdsReturn {
    adContainerRef: React.RefObject<HTMLDivElement | null>;
    isAdPlaying: boolean;
    adCountdown: string | null;
    adCuePoints: number[];
    /** Call when the user initiates first play (required to initialize IMA on mobile) */
    initAds: () => void;
    /** Call from onEnded video event */
    onVideoEnded: () => void;
    /** Call from onTimeUpdate — pass the time before seek for mid-roll tracking */
    updateLastTime: (time: number) => void;
    /** Call from onSeeked with pre-seek and post-seek time */
    onVideoSeeked: (from: number, to: number) => void;
}

export function useAds({
    containerRef,
    videoRef,
    adTagUrl,
    volume,
    isMuted,
    onContentPause,
    onContentResume,
}: UseAdsOptions): UseAdsReturn {
    const adContainerRef = useRef<HTMLDivElement | null>(null);
    const [isAdPlaying, setIsAdPlaying] = useState(false);
    const [adCountdown, setAdCountdown] = useState<string | null>(null);
    const [adCuePoints, setAdCuePoints] = useState<number[]>([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const managerRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loaderRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const displayContainerRef = useRef<any>(null);
    const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const initializedRef = useRef(false);
    const lastTimeRef = useRef(0);
    const cuePointsRef = useRef<number[]>([]);

    // Promise refs so we can resolve/reject from event handlers
    const managerResolveRef = useRef<(() => void) | null>(null);
    const managerRejectRef = useRef<((e: unknown) => void) | null>(null);
    const managerPromiseRef = useRef<Promise<void> | null>(null);

    const enabled = !!(adTagUrl && typeof window !== "undefined");

    const makePromise = useCallback(() => {
        managerPromiseRef.current = new Promise<void>((res, rej) => {
            managerResolveRef.current = res;
            managerRejectRef.current = rej;
        });
    }, []);

    const clearSafetyTimer = useCallback(() => {
        if (safetyTimerRef.current) { clearTimeout(safetyTimerRef.current); safetyTimerRef.current = null; }
    }, []);

    const stopCountdown = useCallback(() => {
        if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
        setAdCountdown(null);
    }, []);

    const startCountdown = useCallback(() => {
        stopCountdown();
        const tick = () => {
            if (!managerRef.current) return;
            const rem = Math.max(0, managerRef.current.getRemainingTime());
            setAdCountdown(`Ad closes in ${formatAdTime(rem)}`);
        };
        tick();
        countdownIntervalRef.current = setInterval(tick, 100);
    }, [stopCountdown]);

    // Cancel ads and fall through to content
    const cancelAds = useCallback(() => {
        clearSafetyTimer();
        stopCountdown();
        initializedRef.current = false;
        setIsAdPlaying(false);
        managerRejectRef.current?.(new Error("cancelled"));
        onContentResume();
    }, [clearSafetyTimer, stopCountdown, onContentResume]);

    const requestAds = useCallback(() => {
        if (!enabled || !loaderRef.current || !containerRef.current) return;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const g = (window as any).google;
            const request = new g.ima.AdsRequest();
            request.adTagUrl = adTagUrl;
            const el = containerRef.current;
            request.linearAdSlotWidth = el.offsetWidth;
            request.linearAdSlotHeight = el.offsetHeight;
            request.nonLinearAdSlotWidth = el.offsetWidth;
            request.nonLinearAdSlotHeight = el.offsetHeight;
            request.forceNonLinearFullSlot = false;
            request.setAdWillPlayMuted(isMuted);
            loaderRef.current.requestAds(request);
        } catch (err) {
            cancelAds();
        }
    }, [enabled, adTagUrl, containerRef, isMuted, cancelAds]);

    const setupIMA = useCallback(() => {
        if (!enabled || !adContainerRef.current || !videoRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (window as any).google;

        g.ima.settings.setVpaidMode(g.ima.ImaSdkSettings.VpaidMode.ENABLED);
        g.ima.settings.setLocale("en");

        displayContainerRef.current = new g.ima.AdDisplayContainer(adContainerRef.current, videoRef.current);
        loaderRef.current = new g.ima.AdsLoader(displayContainerRef.current);

        loaderRef.current.addEventListener(
            g.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (event: any) => {
                clearSafetyTimer();
                const settings = new g.ima.AdsRenderingSettings();
                settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
                settings.enablePreloading = true;

                managerRef.current = event.getAdsManager(videoRef.current, settings);

                // Extract cue points for mid-roll markers (skip 0 and -1)
                const cues: number[] = (managerRef.current.getCuePoints() as number[])
                    .filter(c => c !== 0 && c !== -1);
                cuePointsRef.current = [...cues];
                setAdCuePoints(cues);

                managerRef.current.addEventListener(g.ima.AdErrorEvent.Type.AD_ERROR, cancelAds);
                Object.keys(g.ima.AdEvent.Type).forEach((type: string) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    managerRef.current.addEventListener(g.ima.AdEvent.Type[type], (e: any) => {
                        switch (e.type) {
                            case g.ima.AdEvent.Type.LOADED:
                                startCountdown();
                                break;
                            case g.ima.AdEvent.Type.STARTED:
                                managerRef.current.setVolume(isMuted ? 0 : volume);
                                break;
                            case g.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED:
                                setIsAdPlaying(true);
                                onContentPause();
                                break;
                            case g.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED:
                                stopCountdown();
                                setIsAdPlaying(false);
                                onContentResume();
                                break;
                            case g.ima.AdEvent.Type.ALL_ADS_COMPLETED:
                                stopCountdown();
                                if (videoRef.current?.ended) {
                                    loaderRef.current?.contentComplete();
                                } else {
                                    loaderRef.current?.contentComplete();
                                }
                                break;
                        }
                    });
                });

                managerResolveRef.current?.();
            },
            false
        );

        loaderRef.current.addEventListener(
            g.ima.AdErrorEvent.Type.AD_ERROR,
            () => { clearSafetyTimer(); cancelAds(); },
            false
        );

        requestAds();
    }, [enabled, videoRef, clearSafetyTimer, cancelAds, startCountdown, stopCountdown, isMuted, volume, onContentPause, onContentResume, requestAds]);

    // Initialize IMA SDK — called on first user play gesture
    const initAds = useCallback(() => {
        if (!enabled) return;
        makePromise();

        safetyTimerRef.current = setTimeout(() => {
            cancelAds();
        }, SAFETY_TIMEOUT_MS);

        loadImaScript()
            .then(() => setupIMA())
            .catch(() => cancelAds());
    }, [enabled, makePromise, cancelAds, setupIMA]);

    // Call initAds once, on first play
    const initCalledRef = useRef(false);
    const triggerInitAds = useCallback(() => {
        if (initCalledRef.current || !enabled) return;
        initCalledRef.current = true;
        initAds();
    }, [initAds, enabled]);

    // Play ads when IMA manager is ready
    const playAds = useCallback(() => {
        if (!managerPromiseRef.current || !adContainerRef.current || !containerRef.current) return;
        managerPromiseRef.current.then(() => {
            if (!managerRef.current) return;
            managerRef.current.setVolume(isMuted ? 0 : volume);
            displayContainerRef.current?.initialize();
            if (!initializedRef.current) {
                const el = containerRef.current!;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const g = (window as any).google;
                try {
                    managerRef.current.init(el.offsetWidth, el.offsetHeight, g.ima.ViewMode.NORMAL);
                    managerRef.current.start();
                    initializedRef.current = true;
                } catch {
                    cancelAds();
                }
            }
        }).catch(() => {});
    }, [containerRef, isMuted, volume, cancelAds]);

    // Expose playAds so the player can call it after initAds
    const initAdsAndPlay = useCallback(() => {
        triggerInitAds();
        // Small delay for IMA to set up before play is called
        setTimeout(() => playAds(), 50);
    }, [triggerInitAds, playAds]);

    const onVideoEnded = useCallback(() => {
        if (loaderRef.current) loaderRef.current.contentComplete();
    }, []);

    const updateLastTime = useCallback((time: number) => {
        lastTimeRef.current = time;
    }, []);

    const onVideoSeeked = useCallback((from: number, to: number) => {
        if (!managerRef.current || cuePointsRef.current.length === 0) return;
        // Discard any cue points skipped over
        cuePointsRef.current = cuePointsRef.current.filter(cue => {
            if (from < cue && cue < to) {
                managerRef.current.discardAdBreak();
                return false;
            }
            return true;
        });
    }, []);

    // Resize ad container when player resizes
    useEffect(() => {
        if (!enabled) return;
        const onResize = () => {
            if (managerRef.current && containerRef.current) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const g = (window as any).google;
                if (!g?.ima) return;
                const el = containerRef.current;
                managerRef.current.resize(el.offsetWidth, el.offsetHeight, g.ima.ViewMode.NORMAL);
            }
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [enabled, containerRef]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearSafetyTimer();
            stopCountdown();
            managerRef.current?.destroy();
            displayContainerRef.current?.destroy();
        };
    }, [clearSafetyTimer, stopCountdown]);

    return {
        adContainerRef,
        isAdPlaying,
        adCountdown,
        adCuePoints,
        initAds: initAdsAndPlay,
        onVideoEnded,
        updateLastTime,
        onVideoSeeked,
    };
}
