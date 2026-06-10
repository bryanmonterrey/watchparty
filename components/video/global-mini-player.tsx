"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MiniPlayerOverlay } from "./mini-player-overlay";
import { useMiniPlayer } from "@/contexts/mini-player-context";
import { loadIvsPlayer } from "@/lib/ivs/player-loader";

export function GlobalMiniPlayer() {
    const { miniPlayerData, exitMiniPlayer } = useMiniPlayer();
    const router = useRouter();

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
            setDragPos({
                x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffsetRef.current.x)),
                y: Math.max(0, Math.min(window.innerHeight - 240, e.clientY - dragOffsetRef.current.y)),
            });
        };
        const onUp = () => { isDraggingRef.current = false; };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        return () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
        };
    }, []);

    // ── Load video when data changes ──────────────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !miniPlayerData) return;

        setIsPlaying(false);
        setCurrentTime(miniPlayerData.startTime);
        setDuration(0);
        setBuffered(0);
        setDragPos(null);

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

        video.src = miniPlayerData.videoUrl;
        video.currentTime = miniPlayerData.startTime;
        video.load();
        video.play().catch(() => {});
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
            style={dragPos
                ? { left: dragPos.x, top: dragPos.y, width: 400 }
                : { bottom: 16, right: 16, width: 400 }
            }
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
                        if (v) setCurrentTime(v.currentTime);
                    }}
                    onLoadedMetadata={() => {
                        const v = videoRef.current;
                        if (v) setDuration(v.duration);
                    }}
                    onProgress={() => {
                        const v = videoRef.current;
                        if (v?.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
                    }}
                    onEnded={() => setIsPlaying(false)}
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
