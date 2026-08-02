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
                {/* The offset that puts the feed's left edge exactly where
                    home's left column ends: w-72 is HomeLeftRail's expanded
                    width and lg:block is the breakpoint it appears at, and this
                    row shares home's px-1 — so the spacer's right edge lands on
                    the same x as the rail's.

                    Fixed at the EXPANDED width on purpose. Home's rail collapses
                    to w-11, but that's a per-visit toggle stored in
                    localStorage; tracking it here would make the feed's left
                    edge move depending on what you last did on another page. */}
                <div aria-hidden className="hidden w-72 shrink-0 lg:block" />

                {/* No top margin, deliberately — home's centre column clears the
                    fixed header with md:mt-[var(--header-height)], but the feed
                    doesn't want that: its column is z-100, ABOVE the header
                    (z-50), so the tab bar sits flush at top-0 and the header
                    never covers it. Copying home's margin here parked the tabs a
                    header's height down the page on arrival. */}
                {/* No ml — the feed begins exactly where the left column ends,
                    which is the spacer's edge. Home's centre column has no left
                    margin either, so the two pages share the same vertical. */}
                {/* NOT flex-1. Growing, this swallowed every spare pixel and
                    pushed the rail out to the far right; the feed never moved
                    (it's anchored to the start) so all that width showed up as a
                    gap between the two. Sized to the column instead, with the
                    slack handed to the rail's mr-auto below — the feed keeps its
                    position and the rail comes to sit beside it.

                    The max-w moves up here from the child for the same reason:
                    it's what stops main growing, so it has to be main's. */}
                <main className="relative flex w-full min-w-0 max-w-[628px] flex-col">
                    <div className="relative z-100 min-h-dvh w-full border-soft-gray/[0.12] lg:border-x">
                        {children}
                    </div>
                </main>

                {/* `sticky bottom-0` — scrolls up with the page, then pins once
                    its bottom edge reaches the viewport bottom, so a rail taller
                    than the viewport reveals its full height as you scroll
                    instead of freezing at the top.

                    The sticky belongs on the ASIDE, not on the div inside it.
                    Sticky resolves against its containing block, and `self-end`
                    makes the aside only as tall as its content — so an inner
                    sticky has no range at all, and the rail just sat where it
                    fell: the bottom of a min-h-screen row, below the fold. On
                    the aside the containing block is the tall page row, which is
                    the range it needs.

                    ml-6 is the gap from the feed — 24px, measured off the
                    column's edge rather than left to whatever width happened to
                    be spare. mr-auto is what makes that hold: it hands the row's
                    slack to the space on the rail's RIGHT, so a wider window
                    pushes the dock out rather than prising these two apart. */}
                <aside className="sticky bottom-0 ml-6 mr-auto hidden w-96 shrink-0 self-end xl:block">
                    {/* justify-start, so the rail sits at the left edge of its
                        slot — the ml-6 above is then the whole distance from the
                        feed, with nothing else adding to it. */}
                    <div className="flex justify-start pt-[82px]">
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
