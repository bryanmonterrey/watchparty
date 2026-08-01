"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { HomeCategoryTabs, HOME_TABS } from "./home-category-tabs";
import { TrendingTable } from "@/components/trending/trending-table";
import { useHomeFeedOverlay } from "@/hooks/use-home-feed-overlay";
import { useStuck } from "@/hooks/use-stuck";
import { cn } from "@/lib/utils";

// Home's category tabs plus whatever the selected tab shows.
//
// A client component because the selection has to drive the content below it,
// and the page is a server component. It also owns the spacing that used to sit
// in the page: a full gap above the tabs (bare canvas under the screen) and
// half that below, since the tabs belong to the row they filter.
//
const BrowseFeed = dynamic(
    () => import("@/components/browse/browse-feed").then((module) => module.BrowseFeed),
    { ssr: false, loading: () => <FeedPanelLoading /> },
);

function FeedPanelLoading() {
    return (
        <div className="flex flex-col">
            {Array.from({ length: 5 }).map((_, index) => (
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

export function HomeCategoryPanel() {
    const [active, setActive] = useState(HOME_TABS[0]);
    const openFeed = useHomeFeedOverlay((state) => state.onOpen);
    const { sentinelRef: tabsSentinel, stuck: tabsStuck } = useStuck();

    const selectTab = (tab: string) => {
        if (tab === "Feed" && active === "Feed") {
            openFeed();
            return;
        }
        setActive(tab);
    };

    return (
        <>
            {/* The tabs pin under the app header once you scroll past them, so
                the filter for the board stays reachable while you're down in it.
                Details that matter:

                · top matches the header's own height, and the breakpoint mirrors
                  the centre column's md:mt-[var(--header-height)] — below md the
                  fixed header is hidden (max-md:hidden), so there's nothing to
                  offset against.
                · the canvas fill is applied ONLY while stuck. Unstuck, the hero
                  is still on screen and its ambient glow is spilling down over
                  this strip — an opaque fill there cuts the glow off at a hard
                  edge, which is what it used to do. Stuck, rows are moving
                  behind it and the fill is what stops them showing through.
                  The sentinel above is how that's detected; see useStuck.
                · pb-2 rather than mb-2: a margin isn't painted, so the gap under
                  a stuck bar would be a transparent slot with rows sliding
                  through it.
                · z-15 clears the content below and stays under the app header
                  (z-50). */}
            {/* h-12 is declared rather than left to the content so the offset
                below can be exact: the strip is one row of py-1.5 text-lg
                buttons (28px line box + 12px = 40px) and the arrows are
                absolute, so 40 + pb-2 = 48px = h-12. Pin it and the number
                can't drift out from under whatever stacks beneath it. */}
            {/* h-px, not h-0: a zero-AREA target is an unreliable
                IntersectionObserver subject. -mb-px cancels it, so it costs no
                layout. */}
            <div ref={tabsSentinel} aria-hidden className="h-px -mb-px" />
            <div
                className={cn(
                    "sticky top-0 z-15 h-12 pb-2 transition-colors duration-200 md:top-[var(--header-height)]",
                    tabsStuck && "bg-canvas",
                )}
            >
                <HomeCategoryTabs active={active} onChange={selectTab} />
            </div>

            {/* No fill — everything under the tabs sits straight on the app
                canvas.

                --board-stick is where a child's own sticky header should land:
                directly under the tabs. TrendingTable reads it (defaulting to 0
                when nobody sets it, so it stays usable outside home), which
                keeps home's layout math here instead of baked into a component
                that isn't home's. Below md the fixed app header is hidden, so
                the tabs sit at 0 and this is just their height. */}
            <div className="z-0 flex-1 overflow-clip [--board-stick:3rem] md:[--board-stick:calc(var(--header-height)+3rem)]">
                {active === "Trending Coins" && <TrendingTable />}
                {active === "Feed" && <BrowseFeed homeTabsOffset />}
            </div>
        </>
    );
}
