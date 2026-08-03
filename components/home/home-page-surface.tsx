"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { HomeCenterColumn } from "./home-center-column";
import { HomeRailVideos } from "./home-rail-videos";
import { NewsCard } from "@/components/browse/discover-right-rail";
import { HomeActionDock } from "./home-action-dock";
import { ClipsOverlay } from "./clips-overlay";
import { useHomeFeedOverlay } from "@/hooks/use-home-feed-overlay";

// h-[calc(100svh-5rem)], not h-[100svh]. The 5rem (80px) is the mb-20 the video
// card used to carry INSIDE this box: the card's own height is
// boxHeight - pt - bottomMargin, so moving that 80px out of the card and off the
// box leaves the card measuring exactly what it did before, while freeing the
// space between the box and the news card to be the feed's 18px gap instead of
// an 80px one.
const RAIL_INNER = "flex h-[calc(100svh-5rem)] flex-col md:pt-[calc(var(--header-height)+2px)]";
// No divider on this side — the left rail carries the only one (border-r, see
// home-left-rail), and it sits on the rail rather than on the list inside so it
// runs the full 100svh rather than stopping where the list does.
//
// SAME HEIGHT AS IT ALWAYS WAS (h-[100svh]) but NO LONGER `sticky top-0`, which
// is what makes the card underneath reachable at all. A sticky box this tall
// covers the whole viewport, and being positioned it paints ABOVE a plain
// sibling — so the news card scrolled up behind it and was never visible. The
// column scrolls as a unit now: rail first at its full height, card after it.
const RAIL_INNER_RIGHT = RAIL_INNER;

const BrowseFeed = dynamic(
    () => import("@/components/browse/browse-feed").then((module) => module.BrowseFeed),
    { ssr: false, loading: () => <FeedSurfaceLoading /> },
);

function FeedSurfaceLoading() {
    return (
        <div className="flex flex-col">
            <div className="sticky top-[var(--header-height)] h-13 bg-canvas" />
            {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="border-b border-soft-gray/10 p-4">
                    <div className="flex gap-3">
                        <div className="size-11 rounded-full shimmer-skeleton" />
                        <div className="flex-1 space-y-3">
                            <div className="h-3.5 w-2/5 rounded-full shimmer-skeleton" />
                            <div className="h-3.5 w-4/5 rounded-full shimmer-skeleton" />
                            {index % 2 === 1 && <div className="aspect-video w-full rounded-xl shimmer-skeleton" />}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function DiscoverFeedSurface() {
    return (
        <div className="min-h-screen w-full bg-canvas md:pt-[var(--header-height)]">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="relative mx-auto min-h-screen w-full max-w-[628px] border-x border-soft-gray/[0.12]"
            >
                <BrowseFeed headerOffset />
            </motion.div>
        </div>
    );
}

export function HomePageSurface() {
    const feedOpen = useHomeFeedOverlay((state) => state.open);
    const closeFeed = useHomeFeedOverlay((state) => state.onClose);
    const previousScroll = useRef(0);
    const wasOpen = useRef(false);

    useLayoutEffect(() => {
        const scroller = document.getElementById("app-scroll-container");
        if (!scroller) return;

        if (feedOpen && !wasOpen.current) {
            previousScroll.current = scroller.scrollTop;
            scroller.scrollTo({ top: 0, behavior: "instant" });
        } else if (!feedOpen && wasOpen.current) {
            scroller.scrollTo({ top: previousScroll.current, behavior: "instant" });
        }
        wasOpen.current = feedOpen;
    }, [feedOpen]);

    useEffect(() => {
        if (!feedOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeFeed();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [closeFeed, feedOpen]);

    useEffect(() => () => closeFeed(), [closeFeed]);

    if (feedOpen) return <DiscoverFeedSurface />;

    return (
        // The alerts rail and the row's px-1 live in (rails)/layout.tsx now —
        // /home, /feed and the token page all mount it from there. What's left
        // here is home's own columns, which sit in the space the layout gives
        // this page.
        <div className="relative flex min-h-screen w-full min-w-0">
            {/* Rides the app scroller — the hero scrolls away and the tabs and
                column labels pin as you go down, which is the point. The fill
                those bars need while stuck is applied only once they ARE stuck
                (see useStuck), so unstuck they stay transparent and the hero's
                ambient glow reads through them. */}
            {/* THE FEED'S GEOMETRY, to the pixel — same ml-7, same 628px column,
                same 28px gap, same w-96 rail. /home and /feed sit under the same
                alerts rail and users move between them constantly, so the centre
                column has to stay on the same vertical when they do.

                NOT flex-1, for the reason the feed layout documents: growing, it
                swallows every spare pixel and pushes the rail out to the far
                right while the column itself never moves (it's anchored to the
                start), so the slack all shows up as a gap between the two. Sized
                to the column instead, with the slack handed to the rail's
                mr-auto below.

                The hero and everything under it size off <main>, so this narrows
                them together — which is the point; they now match the feed's
                column rather than running as wide as the window allows.

                COLLAPSING THE ALERTS RAIL RAISES THE CAP, by exactly what the
                rail gives up: w-72 (288px) -> w-11 (44px) is 244px, and
                628 + 244 = 872. That keeps the right rail planted — the column
                absorbs the reclaimed space instead of the whole row sliding left
                into it, which is what a fixed cap did (the rail's own comment
                warns about this; it assumed home's centre was still flex-1).

                A cap swap rather than flex-1, so the column is the feed's 628px
                at rest and only ever grows by the exact amount on offer. */}
            <main className="@container/home relative flex w-full ml-7 min-w-0 max-w-[628px] flex-col md:mt-[var(--header-height)] group-has-[[data-rail-collapsed=true]]/rails:max-w-[872px]">
                <HomeCenterColumn />
            </main>

            {/* ml-7 is the gap from the centre column — measured off the column's
                edge rather than left to whatever width happened to be spare,
                which is what the old xl:pr-3 padding did. mr-auto is what makes
                it hold: the row's slack goes to the rail's RIGHT, so a wider
                window pushes the dock out instead of prising these two apart. */}
            {/* SCROLLS LIKE THE FEED'S THIRD COLUMN — same `sticky bottom-0`
                + `self-end` the feed layout uses, and for the reason it
                documents: the column scrolls up with the page, then pins once
                its bottom edge reaches the viewport bottom, so a column TALLER
                than the viewport reveals its full height as you scroll instead
                of freezing at the top.

                The sticky belongs on the ASIDE, not on the box inside it.
                self-end makes the aside only as tall as its content, so an inner
                sticky has no range to travel; on the aside the containing block
                is the tall page row, which is the range it needs. That's exactly
                what was wrong a moment ago — an inner `sticky top-0` at
                h-[100svh] covered the viewport and, being positioned, painted
                over the news card, so the card could never be reached. */}
            <aside className="sticky bottom-0 ml-7 mr-auto hidden w-96 shrink-0 self-end xl:block">
                {/* Tabs are no longer a sibling here — they're the card's header,
                    inside HomeRailVideos' RailShell, so the rail reads as one
                    outlined box the way the alerts rail does. */}
                {/* THE VIDEO RAIL KEEPS ITS OWN VIEWPORT-HEIGHT BOX, at exactly
                    the height it has always had. The news card goes after it,
                    not inside it: sharing the h-[100svh] between the two
                    shortened the rail, which was backwards — the COLUMN is what
                    grows. The aside is taller than the viewport now and scrolls
                    as a unit, which is what brings the card into view. */}
                <div className={RAIL_INNER_RIGHT}>
                    <HomeRailVideos />
                </div>

                {/* The feed right rail's card itself, not a lookalike — see the
                    export note on NewsCard. It inherits the aside's w-96, so it
                    matches the rail above it by construction. */}
                {/* mt-[18px] — the same gap the feed's rail puts between its own
                    cards (gap-[18px] on DiscoverRightRail's column), so the two
                    columns space their cards identically. It replaces the video
                    card's old mb-20, which was 80px. */}
                <div className="mt-[18px] flex flex-col pb-8">
                    <NewsCard />
                    {/* The SAME h-[50svh] tail the feed's rail ends with
                        (discover-right-rail). It's what carries that column past
                        the bottom of the viewport and gives `sticky bottom-0`
                        something to travel through — without it the column
                        cleared the fold by only the card's height plus pb-20,
                        so there was barely any scroll to feel. Transparent and
                        shrink-0: pure range, it paints nothing. */}
                    <div aria-hidden className="h-[50svh] w-full shrink-0 bg-transparent" />
                </div>
            </aside>

            {/* 4th column, same as the feed's. The slack now sits to its left
                (the rail's mr-auto), so widening the window moves the dock out
                rather than stretching the centre column. */}
            <HomeActionDock />

            <ClipsOverlay />
        </div>
    );
}
