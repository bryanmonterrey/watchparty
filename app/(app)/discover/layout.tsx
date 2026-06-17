import React from "react";
import { DiscoverRail } from "@/components/browse/discover-rail";
import { DiscoverRightRail } from "@/components/browse/discover-right-rail";

// Discover 3-col frame per the updated desktopdesigns/discoverlanding.svg:
// full-bleed — fixed-width feed in the middle, side columns flex to consume
// ALL remaining width (no outer gutters).
//
// Scroll model: ONE scroller (this outer frame). A wheel anywhere scrolls the
// whole page, so the feed and the right column move together — they're in
// normal flow. The left rail is `sticky` so it stays put while everything else
// scrolls. (Previously each column was its own overflow-y-auto, so only the
// hovered column scrolled.)
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-dvh w-full overflow-y-auto hidden-scrollbar px-4 gap-6 relative">
            <aside className="sticky top-0 hidden h-dvh min-w-0 flex-1 self-start lg:block">
                <DiscoverRail />
            </aside>

            {/* z-100 keeps the whole feed column ABOVE the app header (z-50), so
                the header (and its scroll backdrop) never obstructs the feed — it
                only shows over the side columns. */}
            <div className="mx-auto min-h-dvh w-full max-w-[628px] shrink-0 relative z-100 lg:border-x border-soft-gray/[0.12]">
                {children}
            </div>

            {/* Right cards: x=1112…1462 in the 1512 frame → anchored right with
                a 50px page margin, content top at y=102. Scrolls with the page,
                then pins (sticky bottom) once its bottom is reached — it doesn't
                keep scrolling off the top. The aside stretches to the full feed
                height to give the sticky child room to travel. */}
            <aside className="hidden min-w-0 flex-1 xl:block">
                <div className="sticky bottom-0 flex justify-end pt-[82px]">
                    <DiscoverRightRail />
                </div>
            </aside>
            {/* lg–xl: right rail hidden — balance the left flex so the feed stays centered */}
            <div aria-hidden className="hidden flex-1 lg:block xl:hidden" />
        </div>
    );
}
