"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MiniPlayerOverlay } from "./mini-player-overlay";
import { useMiniPlayer } from "@/contexts/mini-player-context";
import { useAudioOwner } from "@/lib/audio-bus";
import { loadIvsPlayer } from "@/lib/ivs/player-loader";

// Gutter between the card and the viewport edges, in px. Also the amount the
// drag clamp keeps on screen.
const EDGE = 16;

export function GlobalMiniPlayer() {
    const { miniPlayerData, exitMiniPlayer, playPrevious, playNext, noteProgress } = useMiniPlayer();
    const router = useRouter();

    // Where this video sits in the rail it came from. A live stream carries no
    // queue, so the transport buttons don't render at all there.
    const queue = miniPlayerData?.queue;
    const queueIndex = queue?.findIndex((v) => v.postId === miniPlayerData?.postId) ?? -1;
    const hasQueue = !!queue?.length && queueIndex >= 0;

    // Live streams come in as IVS .m3u8 playback URLs — a bare <video> can't
    // play HLS outside Safari, so those attach through the IVS player instead.
    const isLive = !!miniPlayerData?.videoUrl.includes(".m3u8");
    const ivsPlayerRef = useRef<ReturnType<NonNullable<Window["IVSPlayer"]>["create"]> | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);

    // ── Thumbnail capture (hidden video + canvas) ─────────────────────────────
    const thumbVideoRef = useRef<HTMLVideoElement | null>(null);
    const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const thumbSeekingRef = useRef(false);
    const thumbTargetRef = useRef(0);
    const [thumbDataUrl, setThumbDataUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!miniPlayerData?.videoUrl || miniPlayerData.videoUrl.includes(".m3u8")) return;

        const v = document.createElement("video");
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.preload = "metadata";
        v.src = miniPlayerData.videoUrl;
        thumbVideoRef.current = v;

        const c = document.createElement("canvas");
        c.width = 160;
        c.height = 90;
        thumbCanvasRef.current = c;

        const onSeeked = () => {
            const ctx = c.getContext("2d");
            if (ctx) {
                ctx.drawImage(v, 0, 0, 160, 90);
                setThumbDataUrl(c.toDataURL("image/jpeg", 0.75));
            }
            thumbSeekingRef.current = false;
            if (Math.abs(thumbTargetRef.current - v.currentTime) > 0.5) {
                v.currentTime = thumbTargetRef.current;
                thumbSeekingRef.current = true;
            }
        };
        v.addEventListener("seeked", onSeeked);

        return () => {
            v.removeEventListener("seeked", onSeeked);
            v.src = "";
            thumbVideoRef.current = null;
            thumbCanvasRef.current = null;
            thumbSeekingRef.current = false;
            setThumbDataUrl(null);
        };
    }, [miniPlayerData?.videoUrl]);

    const seekThumb = useCallback((time: number) => {
        thumbTargetRef.current = time;
        const v = thumbVideoRef.current;
        if (!v || thumbSeekingRef.current) return;
        v.currentTime = time;
        thumbSeekingRef.current = true;
    }, []);

    // ── Drag state ────────────────────────────────────────────────────────────
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
    const dragOffsetRef = useRef({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);

    // Clamped against the card's MEASURED size, not the 400x240 it used to
    // assume: the width is capped by the viewport now (see the style below), so
    // a hardcoded 400 let the card hang off the right edge on a narrow window.
    const clampToViewport = useCallback((x: number, y: number) => {
        const el = wrapperRef.current;
        const w = el?.offsetWidth ?? 400;
        const h = el?.offsetHeight ?? 240;
        return {
            x: Math.max(EDGE, Math.min(window.innerWidth - w - EDGE, x)),
            y: Math.max(EDGE, Math.min(window.innerHeight - h - EDGE, y)),
        };
    }, []);

    const onDragStart = useCallback((e: React.PointerEvent) => {
        if (!wrapperRef.current) return;
        const rect = wrapperRef.current.getBoundingClientRect();
        dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        isDraggingRef.current = true;
        setDragPos({ x: rect.left, y: rect.top });
    }, []);

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            if (!isDraggingRef.current) return;
            setDragPos(clampToViewport(e.clientX - dragOffsetRef.current.x, e.clientY - dragOffsetRef.current.y));
        };
        const onUp = () => { isDraggingRef.current = false; };
        // A dragged card holds absolute coordinates, so shrinking the window
        // strands it off-screen with no way back. Undragged it stays anchored
        // bottom-right by CSS and needs nothing.
        const onResize = () => setDragPos((pos) => (pos ? clampToViewport(pos.x, pos.y) : pos));
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        window.addEventListener("resize", onResize);
        return () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            window.removeEventListener("resize", onResize);
        };
    }, [clampToViewport]);

    // ── Audio bus ─────────────────────────────────────────────────────────────
    // The mini player is an explicit user action, so it takes the page's audio
    // the moment it opens and takes it back whenever the bus goes free. Without
    // this it plays OVER whatever the route it landed on autoplays — the home
    // hero on a different video, a hovered trending-card preview.
    const { isOwner, hasOwner, claim, release } = useAudioOwner();

    useEffect(() => {
        claim();
        return () => release();
    }, [claim, release]);

    useEffect(() => {
        if (!hasOwner) claim();
    }, [hasOwner, claim]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        // `hasOwner &&`, not a bare `!isOwner`: on the first commit the claim
        // above hasn't emitted yet, so isOwner is still false, and muting on
        // that frame only to unmute on the next is the exact sequence WebKit
        // answers by pausing the video (see the note in use-audio-bus).
        video.muted = hasOwner && !isOwner;
    }, [isOwner, hasOwner, miniPlayerData?.postId]);

    // ── Load video when data changes ──────────────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !miniPlayerData) return;

        setIsPlaying(false);
        setCurrentTime(miniPlayerData.startTime);
        setDuration(0);
        setBuffered(0);
        // NOT setDragPos(null) — this effect now also runs when the transport
        // steps to the next video in the queue, and snapping a card the user
        // dragged somewhere back to the corner mid-queue is not a load. The
        // position resets on its own anyway: closing the player unmounts this
        // component, so a fresh open starts docked.

        if (isLive) {
            // IVS HLS: attach through the IVS player (shared script with the
            // stream pages). No startTime — live always joins at the edge.
            let cancelled = false;
            loadIvsPlayer()
                .then(() => {
                    if (cancelled || !videoRef.current) return;
                    if (!window.IVSPlayer?.isPlayerSupported) return;
                    const player = window.IVSPlayer.create();
                    ivsPlayerRef.current = player;
                    player.attachHTMLVideoElement(videoRef.current);
                    player.load(miniPlayerData.videoUrl);
                    player.play();
                })
                .catch(() => {});
            return () => {
                cancelled = true;
                ivsPlayerRef.current?.delete();
                ivsPlayerRef.current = null;
            };
        }

        // The seek has to wait for metadata. Assigning currentTime on an element
        // that has no duration yet is a no-op, and the load() below would have
        // reset it anyway — so handing off at a timestamp silently restarted
        // from zero, which is exactly what a rehydrated player depends on.
        const startAt = miniPlayerData.startTime;
        const onMeta = () => {
            if (startAt <= 0 || !Number.isFinite(video.duration)) return;
            video.currentTime = Math.min(startAt, Math.max(0, video.duration - 0.25));
        };
        video.addEventListener("loadedmetadata", onMeta, { once: true });

        video.src = miniPlayerData.videoUrl;
        video.load();
        // Rejected when the player was restored from storage rather than opened
        // by a click — no gesture, so the browser refuses. It stays parked on
        // the poster with its play button, which is the honest outcome.
        video.play().catch(() => {});

        return () => video.removeEventListener("loadedmetadata", onMeta);
    }, [miniPlayerData?.postId, miniPlayerData?.videoUrl, isLive]); // eslint-disable-line react-hooks/exhaustive-deps

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (isLive && ivsPlayerRef.current) {
            // Pause/resume through the IVS player; resuming rejoins the live edge.
            if (video.paused) ivsPlayerRef.current.play();
            else ivsPlayerRef.current.pause();
            return;
        }
        if (video.paused) video.play().catch(() => {});
        else video.pause();
    }, [isLive]);

    const onSeek = useCallback((frac: number) => {
        if (isLive) return; // no seeking a live stream
        const video = videoRef.current;
        if (!video) return;
        const t = frac * (video.duration || 0);
        video.currentTime = t;
        setCurrentTime(t);
    }, [isLive]);

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0 || duration >= 3600) {
            return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
        }
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const handleExpand = useCallback(() => {
        if (miniPlayerData?.watchUrl) router.push(miniPlayerData.watchUrl);
        exitMiniPlayer();
    }, [miniPlayerData?.watchUrl, router, exitMiniPlayer]);

    if (!miniPlayerData) return null;

    return (
        <div
            ref={wrapperRef}
            onPointerDown={onDragStart}
            className="fixed z-[9999] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 cursor-grab active:cursor-grabbing"
            style={{
                // Capped by the viewport so a narrow window gets a smaller card
                // instead of one hanging off the right edge.
                width: `min(400px, calc(100vw - ${EDGE * 2}px))`,
                ...(dragPos
                    ? { left: dragPos.x, top: dragPos.y }
                    // --dock-width is the right-edge action dock's footprint
                    // (0 where it isn't rendered, or below xl). Docked resting
                    // position sits BESIDE it rather than over its buttons.
                    : { bottom: EDGE, right: `calc(${EDGE}px + var(--dock-width, 0px))` }),
            }}
        >
            {/* Video */}
            <div className="relative w-full aspect-video bg-black">
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    poster={miniPlayerData.thumbnailUrl ?? undefined}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onTimeUpdate={() => {
                        const v = videoRef.current;
                        if (!v) return;
                        setCurrentTime(v.currentTime);
                        // Keeps the persisted resume point fresh. Throttled to
                        // 1Hz inside the context and never touches state.
                        noteProgress(v.currentTime);
                    }}
                    onLoadedMetadata={() => {
                        const v = videoRef.current;
                        if (v) setDuration(v.duration);
                    }}
                    onProgress={() => {
                        const v = videoRef.current;
                        if (v?.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
                    }}
                    onEnded={() => {
                        setIsPlaying(false);
                        // Roll into the rail, same as the home hero does when its
                        // video plays out. Stops at the end rather than wrapping.
                        if (hasQueue && queueIndex < (queue?.length ?? 0) - 1) playNext();
                    }}
                />
                <MiniPlayerOverlay
                    isLive={isLive}
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    bufferedFraction={duration ? buffered / duration : 0}
                    thumbDataUrl={thumbDataUrl}
                    thumbnailUrl={miniPlayerData.thumbnailUrl}
                    formatTime={formatTime}
                    onTogglePlay={togglePlay}
                    onSeek={onSeek}
                    onScrubHover={seekThumb}
                    onClose={exitMiniPlayer}
                    onExpand={handleExpand}
                    onPrevious={hasQueue ? playPrevious : undefined}
                    onNext={hasQueue ? playNext : undefined}
                    hasPrevious={hasQueue && queueIndex > 0}
                    hasNext={hasQueue && queueIndex < (queue?.length ?? 0) - 1}
                />
            </div>

            {/* Title/author strip — inherits cursor-grab from wrapper */}
            <div className="bg-[#1a1a1a] px-4 py-3">
                <p className="text-white text-[15px] font-bold leading-tight line-clamp-1">
                    {miniPlayerData.title ?? ""}
                </p>
                <p className="text-[#aaa] text-[13px] mt-0.5 truncate">
                    {miniPlayerData.author ?? ""}
                </p>
            </div>
        </div>
    );
}
