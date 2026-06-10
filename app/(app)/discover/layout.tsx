import React from "react";
import { DiscoverRail } from "@/components/browse/discover-rail";
import { DiscoverRightRail } from "@/components/browse/discover-right-rail";

// Discover 3-col frame per the updated desktopdesigns/discoverlanding.svg:
// full-bleed — fixed-width feed in the middle, side columns flex to consume
// ALL remaining width (no outer gutters). Columns scroll independently: the
// outer frame is overflow-hidden, the feed has its own scroller, so the left
// rail never moves with feed scroll; the right cards scroll on their own.
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-full w-full overflow-hidden relative">
            <aside className="hidden h-full min-w-0 flex-1 lg:block">
                <DiscoverRail />
            </aside>

            <div className="mx-auto h-full w-full max-w-[619px] shrink-0 overflow-y-auto hidden-scrollbar relative z-0 lg:border-x lg:border-flexborder">
                {children}
            </div>

            {/* Right cards: x=1112…1462 in the 1512 frame → anchored right with
                a 50px page margin, content top at y=102. */}
            <aside className="hidden h-full min-w-0 flex-1 overflow-y-auto hidden-scrollbar xl:block">
                <div className="flex justify-end pl-5 pr-[50px] pt-[102px]">
                    <DiscoverRightRail />
                </div>
            </aside>
            {/* lg–xl: right rail hidden — balance the left flex so the feed stays centered */}
            <div aria-hidden className="hidden flex-1 lg:block xl:hidden" />
        </div>
    );
}
