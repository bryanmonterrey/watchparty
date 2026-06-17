import React from "react";
import { DiscoverScrollBackdrop } from "@/components/browse/discover-scroll-backdrop";
import { DiscoverRail } from "@/components/browse/discover-rail";
import { DiscoverRightRail } from "@/components/browse/discover-right-rail";
import { DiscoverScrollForwarder } from "@/components/browse/discover-scroll-forwarder";

// Discover 3-col frame: fixed-height viewport frame so the side rails and the
// center column's border-x never scroll. The center feed column (#discover-
// feed-scroll) carries its own overflow-y-auto so it scrolls independently
// while the outer frame stays put. This eliminates the sticky-in-finite-parent
// problem: sticky top-0 inside a min-h-dvh aside always breaks once you scroll
// further than (parent height – sticky height), which with h-svh page content
// was immediately.
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
    return (
        <div id="discover-frame" className="relative flex h-dvh w-full items-stretch overflow-hidden px-4 gap-6">
            {/* Scroll backdrop: absolutely positioned at the top of the frame so
                it spans all three columns. z-40 keeps it below the feed (z-100)
                but above the side columns (z-auto), darkening them on scroll. */}
            <div className="absolute inset-x-0 top-0 h-0 z-40 max-md:hidden pointer-events-none">
                <DiscoverScrollBackdrop />
            </div>

            {/* Left rail: fills the full frame height naturally — no sticky needed. */}
            <aside className="hidden min-w-0 flex-1 lg:block">
                <DiscoverRail />
            </aside>

            {/* Center feed: fixed-height column (h-full = h-dvh), border-x lives
                here and never scrolls. Feed content scrolls inside via overflow. */}
            <div
                id="discover-feed-scroll"
                className="hidden-scrollbar h-full w-full max-w-[628px] shrink-0 relative z-100 overflow-y-auto lg:border-x border-soft-gray/[0.12]"
            >
                {children}
            </div>

            {/* Right rail: fills the full frame height. hidden-scrollbar in case
                cards slightly exceed dvh on smaller screens. */}
            <aside id="discover-right-rail" className="hidden min-w-0 flex-1 h-full overflow-y-auto hidden-scrollbar xl:block">
                <div className="pt-[82px]">
                    <DiscoverRightRail />
                </div>
            </aside>
            {/* lg–xl: balance the left flex so the feed stays centered */}
            <div aria-hidden className="hidden flex-1 lg:block xl:hidden" />

            <DiscoverScrollForwarder />
        </div>
    );
}
