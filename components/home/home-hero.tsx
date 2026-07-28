"use client";

import { HomeCarousel } from "./home-carousel2";
import { useHomeFeed } from "./home-feed-context";
import { PlayerLoadingOverlay } from "@/components/video/player-loading";

// The screen slot's contents: whichever video the rail has selected, played by
// the existing hero player (autoplay muted + looped, mute/captions chrome, LIVE
// badge, market-cap chip, links to the watch page).
//
// Keyed on the video id so picking a different one remounts the <video> rather
// than swapping its src on a playing element.
export function HomeHero() {
    const { active, videos, next, isLoading } = useHomeFeed();

    if (isLoading || !active) return <PlayerLoadingOverlay />;

    // onEnded is what makes the screen a queue rather than one looping clip:
    // the video plays out, the feed advances, and the key change remounts the
    // player on the new source.
    //
    // Only when there IS a next one, though. Passing it turns looping off, so a
    // one-video feed would advance to itself — no id change, no remount — and
    // sit frozen on its last frame. Below two videos, looping is the behaviour.
    return (
        <HomeCarousel
            key={active.id}
            videos={[active]}
            fill
            chrome={false}
            ambient
            onEnded={videos.length > 1 ? next : undefined}
        />
    );
}
