import React from "react";
import { DiscoverScrollBackdrop } from "@/components/browse/discover-scroll-backdrop";
import { DiscoverRail } from "@/components/browse/discover-rail";
import { DiscoverRightRail } from "@/components/browse/discover-right-rail";

// Discover 3-col frame — single native scroll, sticky rails (the Twitter/X
// model). The whole row scrolls via the app's scroller (#app-scroll-container);
// there is NO per-column overflow, so hovering the feed OR a rail is the same
// one native scroll — no wheel forwarder, identical feel everywhere.
//
// Sticky setup: the flex row uses `items-start` (NOT stretch) so each aside is
// only as tall as its own content; the aside itself is `position: sticky
// top-0`, pinned against the scroller while the taller feed column keeps the
// row tall enough to scroll. This is the canonical sticky-sidebar pattern and
// is more robust than sticky-on-a-stretched-child, which failed against the
// app shell's nested scroll context (SidebarInset's overflow-x-hidden makes it
// a y-scroll container too).
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative">
            {/* Discover's own scroll backdrop, beneath the global header. The
                sticky h-0 wrapper overlays the top strip without pushing the
                columns down; z-40 keeps it below the feed (z-100). */}
            <div className="sticky top-0 z-40 h-0 max-md:hidden">
                <DiscoverScrollBackdrop />
            </div>

            <div className="flex min-h-dvh w-full items-start px-4 gap-6">
                {/* Left rail: sticky directly on the flex item (items-start keeps
                    it from stretching), pinned to the top of the scroller. */}
                <aside className="sticky top-0 hidden h-dvh min-w-0 flex-1 lg:block">
                    <DiscoverRail />
                </aside>

                {/* Feed column. At xl (right rail visible) it's nudged left of
                    dead-center via a right margin — the extra margin shrinks the
                    flex-1 rails symmetrically, so the feed shifts left by
                    margin/2 (mr-24 → ~48px) and opens more room before the right
                    rail. Bump the mr-* to move it further. */}
                <div className="mx-auto min-h-dvh w-full max-w-[628px] shrink-0 relative z-100 lg:border-x border-soft-gray/[0.12] xl:mr-24">
                    {children}
                </div>

                {/* Right rail: `sticky bottom-0` — scrolls up with the page,
                    then pins once its bottom edge reaches the viewport bottom
                    (so a rail taller than the viewport reveals its full height
                    as you scroll, instead of being frozen at the top). */}
                <aside className="sticky bottom-0 hidden min-w-0 flex-1 self-end xl:block">
                    <div className="flex justify-center pt-[82px]">
                        <DiscoverRightRail />
                    </div>
                </aside>
                {/* lg–xl: right rail hidden — balance the left flex so the feed stays centered */}
                <div aria-hidden className="hidden flex-1 lg:block xl:hidden" />
            </div>
        </div>
    );
}
