"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
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
// Three things separate it from the watch page's mount, all of them props:
// autoplay, the audio bus (so a hovered card's preview doesn't double up with
// it), and `fill`, because this slot grows past 16:9 in focus mode.
//
// Engagement is NOT one of them (owner call 2026-08-15): playing here is real
// watching, so the hero counts a view, records heatmap buckets and saves watch
// progress exactly as the watch page does — and resumes from it, which is the
// half people forget comes with saving.
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
            loop={!hasQueue}
            onEnded={hasQueue ? next : undefined}
            theaterMode={theaterMode}
            onTheaterModeChange={onTheaterModeChange}
            onEnterMiniPlayer={handleEnterMiniPlayer}
            topRightAction={<GoToVideo postId={active.id} />}
        />
    );
}

// The hero's only route to the watch page. The screen used to be one big
// <Link>, which a player that handles its own clicks can't be — so the link
// becomes a control, and lives in the chrome so it comes and goes with the
// rest of it instead of sitting on the video.
//
// Height is the player's control height, not the app's h-11 button scale: it
// sits in a row with the settings and fullscreen pills and has to match THEM.
//
// The chevron is two paths meeting at (10, 8) rather than one glyph, because
// transitions.dev's "learn more hover" spreads the arms apart into a full
// arrow on hover — see the .t-learn block in globals.css.
function GoToVideo({ postId }: { postId: string }) {
    return (
        <Link
            href={`/video/${postId}`}
            className="t-learn flex h-(--player-control-h) cursor-pointer items-center gap-1.5 rounded-full bg-black/30 px-4 text-sm font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white"
        >
            Go to video
            <span className="t-learn-chevron">
                <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path className="t-learn-arm t-learn-arm-top" d="M6 4L10 8" />
                    <path className="t-learn-arm t-learn-arm-bot" d="M10 8L6 12" />
                </svg>
            </span>
        </Link>
    );
}
