import React from "react";
import { DiscoverScrollBackdrop } from "@/components/browse/discover-scroll-backdrop";
import { DiscoverRail } from "@/components/browse/discover-rail";
import { DiscoverRightRail } from "@/components/browse/discover-right-rail";

// Discover 3-col frame per the updated desktopdesigns/discoverlanding.svg:
// full-bleed — fixed-width feed in the middle, side columns flex to consume
// ALL remaining width (no outer gutters).
//
// Scroll model: the page scrolls via the app's own scroller (#app-scroll-
// container), NOT a per-column overflow. The layout grows to the feed height
// (min-h-dvh, no overflow here), so a wheel anywhere scrolls everything
// together. The left rail is `sticky top-0` (stays put). The right column
// stretches to the full feed height (flex stretch — only possible because the
// outer is content-height, not a fixed-height scroller) and its content is
// `sticky bottom-0`, so it scrolls with the page then PINS once its bottom is
// reached, instead of scrolling off into oblivion.
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative">
            {/* Discover's own scroll backdrop, beneath the global header. The
                sticky h-0 wrapper overlays the top strip without pushing the
                columns down; z-40 keeps it below the feed (z-100), so it darkens
                the side columns on scroll but never obstructs the feed. */}
            <div className="sticky top-0 z-40 h-0 max-md:hidden">
                <DiscoverScrollBackdrop />
            </div>

            <div className="flex min-h-dvh w-full px-4 gap-6">
                <aside className="sticky top-0 hidden h-dvh min-w-0 flex-1 self-start lg:block">
                <DiscoverRail />
            </aside>

            <div className="mx-auto min-h-dvh w-full max-w-[628px] shrink-0 relative z-100 lg:border-x border-soft-gray/[0.12]">
                {children}
            </div>

            {/* Right cards: x=1112…1462 in the 1512 frame → anchored right with
                a 50px page margin, content top at y=102. */}
            <aside className="hidden min-w-0 flex-1 xl:block">
                <div className="sticky bottom-0 flex justify-end pt-[82px]">
                    <DiscoverRightRail />
                </div>
            </aside>
            {/* lg–xl: right rail hidden — balance the left flex so the feed stays centered */}
            <div aria-hidden className="hidden flex-1 lg:block xl:hidden" />
            </div>
        </div>
    );
}
