"use client";

import { HomeCarousel } from "./home-carousel2";
import { useHomeFeed } from "./home-feed-context";

// The screen slot's contents: whichever video the rail has selected, played by
// the existing hero player (autoplay muted + looped, mute/captions chrome, LIVE
// badge, market-cap chip, links to the watch page).
//
// Keyed on the video id so picking a different one remounts the <video> rather
// than swapping its src on a playing element.
export function HomeHero() {
    const { active, isLoading } = useHomeFeed();

    if (isLoading || !active) {
        return <div className="size-full shimmer-skeleton" />;
    }

    return <HomeCarousel key={active.id} videos={[active]} fill />;
}
