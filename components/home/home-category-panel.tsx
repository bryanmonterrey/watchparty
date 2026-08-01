"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { HomeCategoryTabs, HOME_TABS } from "./home-category-tabs";
import { TrendingTable } from "@/components/trending/trending-table";
import { useHomeFeedOverlay } from "@/hooks/use-home-feed-overlay";

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

    const selectTab = (tab: string) => {
        if (tab === "Feed" && active === "Feed") {
            openFeed();
            return;
        }
        setActive(tab);
    };

    return (
        <>
            {/* The tabs no longer pin, and no longer carry a fill. The centre
                column is a bounded h-screen box and the board scrolls inside
                its own container below, so these sit permanently in view with
                nothing ever passing behind them — which is exactly what let the
                opaque bg-canvas go. Without it the hero's ambient glow spills
                down through the strip instead of hitting a flat edge.

                h-12 stays declared rather than left to the content: the strip is
                one row of py-1.5 text-lg buttons (28px line box + 12px = 40px)
                and the arrows are absolute, so 40 + pb-2 = 48px = h-12. */}
            <div className="h-12 shrink-0 pb-2">
                <HomeCategoryTabs active={active} onChange={selectTab} />
            </div>

            {/* The board's own box. It owns the remaining height; whatever it
                renders owns the scrolling inside that.

                --board-stick is 0 now: a child's sticky header pins to the top
                of ITS scroller, and that scroller already starts below the tabs.
                The variable stays rather than being deleted so TrendingTable
                keeps working for any caller that does need an offset. */}
            <div className="flex min-h-0 flex-1 flex-col [--board-stick:0px]">
                {active === "Trending Coins" && <TrendingTable />}
                {/* BrowseFeed renders a list that just grows, so the scroller
                    is supplied here rather than inside it. */}
                {active === "Feed" && (
                    <div className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto">
                        <BrowseFeed homeTabsOffset />
                    </div>
                )}
            </div>
        </>
    );
}
