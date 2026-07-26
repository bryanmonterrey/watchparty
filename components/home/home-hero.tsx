"use client";

import { HomeCarousel } from "./home-carousel2";
import { useHomeFeed } from "./home-feed-context";

// Black screen + the watch page's spinner, NOT a shimmer skeleton: this slot
// becomes a video player, so it should load like one. Markup and classes are
// the same `ytp-spinner` the full player uses (styles live in globals.css), so
// the two read identically.
function HeroLoading() {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="ytp-spinner">
                <div className="ytp-spinner-container">
                    <div className="ytp-spinner-rotator">
                        <div className="ytp-spinner-left">
                            <div className="ytp-spinner-circle" />
                        </div>
                        <div className="ytp-spinner-right">
                            <div className="ytp-spinner-circle" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// The screen slot's contents: whichever video the rail has selected, played by
// the existing hero player (autoplay muted + looped, mute/captions chrome, LIVE
// badge, market-cap chip, links to the watch page).
//
// Keyed on the video id so picking a different one remounts the <video> rather
// than swapping its src on a playing element.
export function HomeHero() {
    const { active, isLoading } = useHomeFeed();

    if (isLoading || !active) return <HeroLoading />;

    return <HomeCarousel key={active.id} videos={[active]} fill chrome={false} ambient />;
}
