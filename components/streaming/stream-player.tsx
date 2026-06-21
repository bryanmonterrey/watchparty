"use client";

import { useEffect, useRef, useState } from "react";
import { UserType } from "@/db/schema/auth/user";
import { X, MessageCircle, PictureInPicture2 } from "lucide-react";
import { AmbientGlow } from "video-ambient-glow";
import { StreamOverlayAd } from "@/components/ads/stream-overlay-ad";

interface StreamPlayerProps {
    playbackUrl: string | null;
    isLive: boolean;
    host: UserType;
    showChat: boolean;
    onToggleChat: () => void;
    /** Pops the live stream out into the global mini player. */
    onEnterMiniPlayer?: () => void;
    isLoading?: boolean;
}

export function StreamPlayer({ playbackUrl, isLive, host, showChat, onToggleChat, onEnterMiniPlayer, isLoading }: StreamPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<any>(null);
    const glowRef = useRef<AmbientGlow | null>(null);
    const [playerReady, setPlayerReady] = useState(false);

    useEffect(() => {
        if (isLoading) return;
        if (window.IVSPlayer) { setPlayerReady(true); return; }
        const script = document.createElement("script");
        script.src = "https://player.live-video.net/1.29.0/amazon-ivs-player.min.js";
        script.onload = () => setPlayerReady(true);
        document.head.appendChild(script);
    }, [isLoading]);

    useEffect(() => {
        if (isLoading) return;
        if (!playerReady || !playbackUrl || !videoRef.current || !isLive) return;
        if (!window.IVSPlayer?.isPlayerSupported) return;

        const player = window.IVSPlayer.create();
        playerRef.current = player;
        player.attachHTMLVideoElement(videoRef.current);
        player.load(playbackUrl);
        player.play();

        glowRef.current = new AmbientGlow(videoRef.current, {
            blur: 120,
            opacity: 0.5,
            brightness: 1.1,
            saturate: 1.2,
            scale: 1.05,
            downscale: 0.1,
            updateInterval: 98,
            responsiveness: 0.1,
        });

        return () => { 
            player.delete(); 
            playerRef.current = null; 
            glowRef.current?.destroy();
            glowRef.current = null;
        };
    }, [isLoading, playerReady, playbackUrl, isLive]);

    if (isLoading) {
        return (
            <div className="shimmer-skeleton w-full aspect-video rounded-xl" />
        );
    }

    return (
        <div className="ambient-video-container isolate relative aspect-video rounded-xl shadow-2xl [contain:none] overflow-visible">
            {/* Dark backdrop to catch the glow */}
            <div className="absolute inset-0 z-0 bg-black rounded-xl" />

            {isLive ? (
                <video
                    ref={videoRef}
                    crossOrigin="anonymous"
                    className="w-full h-full object-cover outline-none rounded-xl relative z-10"
                    playsInline
                    autoPlay
                />
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/80 backdrop-blur-sm rounded-xl z-10">
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 border-[3px] border-zinc-700 mb-4 opacity-50 grayscale">
                        {host.avatar_url ? (
                            <img src={host.avatar_url} alt={host.name ?? ""} className="object-cover w-full h-full" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                                {(host.name ?? "?")[0]?.toUpperCase()}
                            </div>
                        )}
                    </div>
                    <p className="text-white font-bold text-xl tracking-wide">{host.name} is offline</p>
                </div>
            )}

            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                {isLive && onEnterMiniPlayer && (
                    <button
                        onClick={onEnterMiniPlayer}
                        title="Pop out player"
                        className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                    >
                        <PictureInPicture2 className="w-[18px] h-[18px]" />
                    </button>
                )}
                <button
                    onClick={onToggleChat}
                    className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                >
                    {showChat ? <X className="w-[18px] h-[18px]" /> : <MessageCircle className="w-[18px] h-[18px]" />}
                </button>
            </div>

            {/* Sponsored overlay — only on a live stream; self-hides when unfilled. */}
            {isLive && <StreamOverlayAd />}
        </div>
    );
}
