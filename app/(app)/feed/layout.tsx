import React from "react";
import { DiscoverScrollBackdrop } from "@/components/browse/discover-scroll-backdrop";
import { DiscoverRightRail } from "@/components/browse/discover-right-rail";
import { HomeActionDock } from "@/components/home/home-action-dock";

// /feed (formerly /discover) in HOME'S column frame: the feed column starts
// where home's first column ends, a right rail, and home's action dock in the
// far gutter.
//
// The left column is EMPTY — a spacer the width of home's alerts rail, not the
// rail itself. Coin alerts are home's, and putting them here would have made
// the feed a second home; the spacer keeps the feed starting on the same
// vertical as home's centre column so switching between the two doesn't shift
// the content sideways. Drop the spacer and the feed re-centres itself in the
// wider row (the column is mx-auto), which is the other reasonable answer.
//
// The old DiscoverRail is no longer rendered anywhere; see the note in the
// commit about the Post button and Bookmarks entry it used to carry.
//
// Single native scroll, as before: the whole row scrolls via the app's
// scroller (#app-scroll-container) and no column has its own overflow, so
// hovering the feed or a rail is the same one scroll. The rails pin with
// `sticky` against that scroller.
export default function FeedLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative">
            {/* The feed's own scroll backdrop, beneath the global header. The
                sticky h-0 wrapper overlays the top strip without pushing the
                columns down; z-40 keeps it below the feed (z-100). */}
            <div className="sticky top-0 z-40 h-0 max-md:hidden">
                <DiscoverScrollBackdrop />
            </div>

            {/* Mirrors home-page-surface's row: px-1, rails either side of a
                flex-1 centre, dock last. */}
            <div className="relative flex min-h-screen w-full px-1">
                {/* w-72 matches HomeLeftRail's expanded width, and lg:block
                    matches the breakpoint it appears at, so the feed lines up
                    with home's centre column at every size home's rail exists. */}
                <div aria-hidden className="hidden w-72 shrink-0 lg:block" />

                <main className="relative flex min-w-0 flex-1 flex-col md:mt-[var(--header-height)] lg:ml-2.5">
                    {/* The feed column keeps its own measure and edges — the
                        frame around it changed, the column didn't. */}
                    <div className="relative z-100 mx-auto min-h-dvh w-full max-w-[628px] border-soft-gray/[0.12] lg:border-x">
                        {children}
                    </div>
                </main>

                {/* `sticky bottom-0` — scrolls up with the page, then pins once
                    its bottom edge reaches the viewport bottom, so a rail taller
                    than the viewport reveals its full height as you scroll
                    instead of freezing at the top. w-96 rather than a flex
                    share: the centre column is flex-1 now, so an unsized gutter
                    would fight it for width. DiscoverRightRail draws at 368px
                    and centres in what's left. */}
                <aside className="hidden w-96 shrink-0 self-end xl:block">
                    <div className="sticky bottom-0 flex justify-center pt-[82px]">
                        <DiscoverRightRail />
                    </div>
                </aside>

                {/* Home's 4th column. Its width comes out of <main> (flex-1),
                    so the right rail keeps its w-96. */}
                <HomeActionDock />
            </div>
        </div>
    );
}
