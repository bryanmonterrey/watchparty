"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useHomeFeed } from "./home-feed-context";
import { PlayerLoadingOverlay } from "@/components/video/player-loading";
import { useMiniPlayer } from "@/contexts/mini-player-context";

// ssr:false for the same reason the watch page does it: this is the only import
// path to hls.js, and Turbopack bundles a dynamic import's target whether or not
// the code path can run on the server — 152 KiB gzipped of browser-only player
// inside the Cloudflare Worker, which is close to its 10 MiB ceiling. Home is
// the app's busiest route, so it matters more here than anywhere.
const VideoPlayer = dynamic(
    () => import("@/components/video/video-player").then((m) => m.VideoPlayer),
    { ssr: false, loading: () => <PlayerLoadingOverlay /> },
);

// The screen slot's contents: whichever video the rail has selected, played by
// the SAME player the watch page uses — scrubber with previews and heatmap,
// speed, quality, captions and caption styling, ambient toggle, stable volume /
// voice boost / spatial audio, PiP, theater, fullscreen, keyboard shortcuts.
//
// It used to be a bare <video> with a mute button (HomeCarousel, still used by
// _legacy's desktop-home). Everything that made the hero look like the hero is
// kept, because it was never in that component: the 16:9 frame and its rounding
// belong to the slot and to MEDIA_RADIUS, and the ambient glow behind it is the
// same AMBIENT_PRESET the full player already runs.
//
// Four things separate it from the watch page's mount, all of them props:
// autoplay, the audio bus (so a hovered card's preview doesn't double up with
// it), `transient` (a video that started playing on its own must not count a
// view or write watch progress for the whole feed), and `fill`, because this
// slot grows past 16:9 in focus mode.
//
// Keyed on the video id so picking a different one remounts the player rather
// than swapping its src on a playing element.
export function HomeHero({
    theaterMode,
    onTheaterModeChange,
}: {
    /** Home's focus mode, which is what the player's theater button toggles here. */
    theaterMode?: boolean;
    onTheaterModeChange?: (isTheater: boolean) => void;
}) {
    const { active, videos, next, isLoading } = useHomeFeed();
    const { miniPlayerData, enterMiniPlayer, exitMiniPlayer } = useMiniPlayer();
    const pathname = usePathname();

    const handleEnterMiniPlayer = useCallback((currentTime: number) => {
        if (!active) return;
        enterMiniPlayer({
            postId: active.id,
            videoUrl: active.videoUrl ?? "",
            thumbnailUrl: active.thumbnailUrl,
            title: active.title,
            author: active.user.username,
            startTime: currentTime,
            watchUrl: pathname,
        });
    }, [active, enterMiniPlayer, pathname]);

    if (isLoading || !active) return <PlayerLoadingOverlay />;

    // This video is playing in the floating mini player. Standing the hero down
    // is what keeps them from playing over each other — the same swap the watch
    // page makes.
    if (miniPlayerData?.postId === active.id) {
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                {active.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={active.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover opacity-20" />
                )}
                <p className="relative text-sm text-white/70">Playing in mini player</p>
                <button
                    type="button"
                    onClick={exitMiniPlayer}
                    className="relative cursor-pointer rounded-full bg-white/10 px-4 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
                >
                    Resume here
                </button>
            </div>
        );
    }

    // onEnded is what makes the screen a queue rather than one looping clip:
    // the video plays out, the feed advances, and the key change remounts the
    // player on the new source.
    //
    // Only when there IS a next one, though. Below two videos there is nothing
    // to advance to — the feed would hand back the same id, no remount, and the
    // player would sit on the end screen — so a one-video feed loops instead.
    const hasQueue = videos.length > 1;

    return (
        <VideoPlayer
            key={active.id}
            postId={active.id}
            title={active.title}
            videoUrl={active.videoUrl ?? null}
            thumbnailUrl={active.thumbnailUrl}
            fill
            autoPlay
            audioBus
            transient
            loop={!hasQueue}
            onEnded={hasQueue ? next : undefined}
            theaterMode={theaterMode}
            onTheaterModeChange={onTheaterModeChange}
            onEnterMiniPlayer={handleEnterMiniPlayer}
        />
    );
}
