"use client";

import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDownDoubleIcon, ArrowUpDoubleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { HomeHero } from "./home-hero";
import { HomeCategoryPanel } from "./home-category-panel";
import { HomeVideoHeader } from "./home-video-header";
import { useHomeFeed } from "./home-feed-context";

// Home's centre column: the screen, a focus toggle under it, and the category
// tabs + their content.
//
// A client component because the toggle spans all three — it collapses the tabs
// AND resizes the screen above them, and the page itself is a server component,
// so the state and everything it changes have to share one boundary.
//
// Persisted, like the left rail's collapse: a view mode you chose should
// survive a navigation rather than snapping back.

// EXPANDED IS THE DEFAULT (2026-10-02): the coin list under the screen is the
// part of this page that isn't working, so a first-time visitor gets the video
// and its header rather than tabs over an empty board. Collapsing is still a
// choice and still persists.
//
// The key is :v2 on purpose. The old key stored "0" for anyone who had ever
// touched the toggle, and under the old default "0" was also simply where
// everyone sat — keeping it would have left exactly the people who use the
// page most on the view this change is meant to replace.
const STORAGE_KEY = "wp:home:focus:v2";

// Expanded, the screen takes the viewport below the app header, less the strip
// under it. Not 100svh — that would push the strip off the bottom and there'd
// be no way back without scrolling.
//
// 6.5rem, not the 3.5rem this reserved when the strip held only the toggle:
// expanding is exactly when the video header appears, and the tallest case (a
// coin video, whose token row is the extra line) runs ~5.5rem of
// avatar/title/meta/token row. It was 7.5 while the toggle sat on its own line
// below the header; the toggle is inside the header now, so that line is back.
// A little unused space below the screen is harmless, overflowing is not.
//
// MIN-height over height, and 16:9 always on: expanding must never make the
// screen SMALLER. On a wide, short window the column's own 16:9 height is
// taller than what's left of the viewport, so setting height outright shrank
// the video on the way into focus mode — the opposite of what the toggle
// promises. As a floor it can only grow it, and both states are real lengths
// (0 → px) so the transition still runs.
const HERO_BASE = "aspect-video w-full transition-[min-height] duration-300 ease-out";
const HERO_EXPANDED = "min-h-[calc(100svh-var(--header-height)-6.5rem)]";
const HERO_DEFAULT = "min-h-0";

export function HomeCenterColumn() {
    const [focus, setFocus] = useState(true);
    const { active } = useHomeFeed();

    // After mount, never during render — the app shell server-renders and
    // reading localStorage in render would be a hydration mismatch.
    useEffect(() => {
        try {
            // Only an explicit "0" collapses; no stored value means expanded.
            if (window.localStorage.getItem(STORAGE_KEY) === "0") setFocus(false);
        } catch {
            // storage disabled — the default (expanded) view is the right fallback
        }
    }, []);

    const setFocusTo = useCallback((next: boolean) => {
        setFocus(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch { /* not worth failing the toggle over */ }
    }, []);

    const toggle = () => setFocusTo(!focus);

    // One definition, two homes: inside the header's second row when expanded,
    // alone in the strip when not.
    const toggleButton = (
        <button
            type="button"
            onClick={toggle}
            aria-expanded={!focus}
            aria-label={focus ? "show categories" : "hide categories"}
            className="flex shrink-0 cursor-pointer items-center px-1.5 text-zinc-400 transition-colors hover:text-white"
        >
            <HugeiconsIcon
                icon={focus ? ArrowUpDoubleIcon : ArrowDownDoubleIcon}
                className="size-6"
                strokeWidth={2}
            />
        </button>
    );

    return (
        <>
            {/* The screen. The slot owns the size; the player just fills it.
                Deliberately NOT overflow-hidden: the hero runs the watch page's
                ambient glow, which paints a blurred copy of the frame past the
                video's edges. Any clipping ancestor between the video and where
                the glow should fade removes the effect entirely. */}
            <div
                className={cn("relative bg-sidebar-hover/25", HERO_BASE, focus ? HERO_EXPANDED : HERO_DEFAULT)}
            >
                {/* Theater mode IS focus mode: the player's theater button
                    changes the same thing the chevron below does, so it drives
                    this state rather than keeping a second one that would
                    disagree with it. */}
                <HomeHero theaterMode={focus} onTheaterModeChange={setFocusTo} />
            </div>

            {/* The video's header, with the focus toggle at its right edge.
                One row so the toggle keeps sitting under the screen on the
                right while the metadata fills the space beside it.

                relative z-10 is load-bearing: the screen above is `relative`,
                and a positioned element paints above a non-positioned sibling
                no matter the DOM order — so the hero, including the ambient
                glow that deliberately spills past its edges, covers anything in
                this row unless it's lifted out. */}
            <div className="relative z-10 flex flex-col pl-1 pr-1">
                {/* Expanding swaps what's under the screen: the header appears
                    and the tabs + their content fold away, so the column reads
                    as one video and its details rather than a feed.

                    Keyed on the video: the header owns like state locally after
                    seeding it from props, which only stays correct if switching
                    videos remounts it.

                    The chevron goes INSIDE the header when there is one, as the
                    last item on its second row next to the count and date —
                    handed down rather than nudged up with a negative margin, so
                    flexbox does the aligning and it can't drift when the title
                    wraps to two lines. With no header (the default view) it
                    stands alone, right-aligned. */}
                {focus && active ? (
                    <HomeVideoHeader key={active.id} video={active} action={toggleButton} />
                ) : (
                    <div className="mt-1 flex justify-end">{toggleButton}</div>
                )}
            </div>

            {/* Category tabs plus the selected tab's content. Unmounted rather
                than hidden when folded away, so the board's queries and its
                two-minute refetch stop with it. */}
            {!focus && <HomeCategoryPanel />}
        </>
    );
}
