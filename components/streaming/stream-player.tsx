"use client";

import { useEffect, useRef, useState } from "react";
import { UserType } from "@/db/schema/auth/user";
import { PictureInPicture2 } from "lucide-react";
import { AmbientGlow } from "video-ambient-glow";
import { AMBIENT_PRESET } from "@/hooks/use-ambient-glow";
import { MEDIA_RADIUS } from "@/components/video/media-radius";
import { StreamOverlayAd } from "@/components/ads/stream-overlay-ad";
import { PlayerLoadingScreen } from "@/components/video/player-loading";

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

        // The shared preset (home's), spread whole — this is the one player that
        // constructs AmbientGlow directly instead of going through the hook, so
        // nothing fills in the keys it leaves out.
        glowRef.current = new AmbientGlow(videoRef.current, AMBIENT_PRESET);

        return () => { 
            player.delete(); 
            playerRef.current = null; 
            glowRef.current?.destroy();
            glowRef.current = null;
        };
    }, [isLoading, playerReady, playbackUrl, isLive]);

    if (isLoading) {
        return (
            <PlayerLoadingScreen />
        );
    }

    return (
        // bg-muted on the CONTAINER rather than a black layer inside it. Two
        // things going on: the glow canvas sits at z-index:-1, which paints over
        // a parent background but under any positioned sibling, so an absolute
        // backdrop hid the glow it was meant to catch — and the glow is only 35%
        // opaque, so the backdrop colour is 65% of what a letterbox bar looks
        // like. Home uses muted; black is what made these bars murky.
        //
        // MEDIA_RADIUS goes on the container AND the <video> (and the offline
        // placeholder below): ambient can't clip, so the media would otherwise
        // paint square corners over a rounded box. Same radius as the home hero
        // and the video page.
        <div className={`ambient-video-container isolate relative aspect-video bg-muted [contain:none] overflow-visible ${MEDIA_RADIUS}`}>
            {isLive ? (
                <video
                    ref={videoRef}
                    crossOrigin="anonymous"
                    // contain, not cover: a stream that isn't 16:9 was being
                    // cropped to fill. It fits whole now, and the ambient glow
                    // fills the bars — same as the home hero.
                    className={`w-full h-full object-contain outline-none relative z-10 ${MEDIA_RADIUS}`}
                    playsInline
                    autoPlay
                />
            ) : (
                <div className={`absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/80 backdrop-blur-sm z-10 ${MEDIA_RADIUS}`}>
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

            {/* The chat collapse toggle used to sit here, over the picture. It's
                gone: chat is a tab in the right rail now, so hiding it from on
                top of the video was a control for a layout that no longer
                exists — and nothing should cover the frame that doesn't have to.
                onToggleChat/showChat stay on the props so the parent's state and
                the rail's width logic are untouched. */}
            {isLive && onEnterMiniPlayer && (
                <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                    <button
                        onClick={onEnterMiniPlayer}
                        title="Pop out player"
                        className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                    >
                        <PictureInPicture2 className="w-[18px] h-[18px]" />
                    </button>
                </div>
            )}

            {/* Sponsored overlay — only on a live stream; self-hides when unfilled. */}
            {isLive && <StreamOverlayAd />}
        </div>
    );
}
