"use client";

import { useEffect, useState } from "react";
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

const STORAGE_KEY = "wp:home:focus";

// Expanded, the screen takes the viewport below the app header, less the strip
// under it. Not 100svh — that would push the strip off the bottom and there'd
// be no way back without scrolling.
//
// 6.5rem, not the 3.5rem this reserved when the strip held only the toggle:
// expanding is exactly when the video header appears, and that's ~4.5rem of
// avatar/title/meta/token row. Reserving for the tallest case (a coin video,
// whose token row is the extra line) — a little unused space below the screen
// is harmless, overflowing the viewport is not.
const HERO_EXPANDED = "h-[calc(100svh-var(--header-height)-6.5rem)] w-full";
const HERO_DEFAULT = "aspect-video w-full";

export function HomeCenterColumn() {
    const [focus, setFocus] = useState(false);
    const { active } = useHomeFeed();

    // After mount, never during render — the app shell server-renders and
    // reading localStorage in render would be a hydration mismatch.
    useEffect(() => {
        try {
            setFocus(window.localStorage.getItem(STORAGE_KEY) === "1");
        } catch {
            // storage disabled — the default view is the right fallback
        }
    }, []);

    const toggle = () => {
        setFocus((prev) => {
            const next = !prev;
            try {
                window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
            } catch { /* not worth failing the toggle over */ }
            return next;
        });
    };

    return (
        <>
            {/* The screen. The slot owns the size; the player just fills it.
                Deliberately NOT overflow-hidden: the hero runs the watch page's
                ambient glow, which paints a blurred copy of the frame past the
                video's edges. Any clipping ancestor between the video and where
                the glow should fade removes the effect entirely. */}
            <div
                className={cn(
                    "relative bg-sidebar-hover/25 transition-[height] duration-300 ease-out",
                    focus ? HERO_EXPANDED : HERO_DEFAULT,
                )}
            >
                <HomeHero />
            </div>

            {/* The video's header, with the focus toggle at its right edge.
                One row so the toggle keeps sitting under the screen on the
                right while the metadata fills the space beside it.

                relative z-10 is load-bearing: the screen above is `relative`,
                and a positioned element paints above a non-positioned sibling
                no matter the DOM order — so the hero, including the ambient
                glow that deliberately spills past its edges, covers anything in
                this row unless it's lifted out. */}
            <div className="relative z-10 flex items-start gap-2 pl-1 pr-1">
                {/* Expanding swaps what's under the screen: the header appears
                    and the tabs + their content fold away, so the column reads
                    as one video and its details rather than a feed.

                    Keyed on the video: the header owns like state locally after
                    seeding it from props, which only stays correct if switching
                    videos remounts it. */}
                {focus && active && <HomeVideoHeader key={active.id} video={active} className="flex-1" />}

                {/* ml-auto pins this right on its own. Nothing else can: the
                    header is what would otherwise push it, and the header is
                    absent in the default view and while the feed loads.

                    self-end drops it to the bottom of the row: the row is
                    items-start so the header's avatar/title line up under the
                    screen, and the chevron reads better at the row's baseline
                    than floating at the top of a three-line header. Alone (in
                    the default view) the row is only as tall as the button, so
                    it has no effect there. */}
                <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={!focus}
                    aria-label={focus ? "show categories" : "hide categories"}
                    className="ml-auto flex shrink-0 cursor-pointer items-center self-end px-1.5 text-zinc-400 transition-colors hover:text-white"
                >
                    <HugeiconsIcon
                        icon={focus ? ArrowUpDoubleIcon : ArrowDownDoubleIcon}
                        className="size-6"
                        strokeWidth={2}
                    />
                </button>
            </div>

            {/* Category tabs plus the selected tab's content. Unmounted rather
                than hidden when folded away, so the board's queries and its
                two-minute refetch stop with it. */}
            {!focus && <HomeCategoryPanel />}
        </>
    );
}
