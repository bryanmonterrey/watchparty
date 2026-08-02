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
                <main className="relative flex min-w-0 flex-1 flex-col">
                    {/* Left-aligned, NOT mx-auto. Centred, the column floated in
                        whatever width was left over, so where it began moved
                        with the window and never lined up with anything. Anchored
                        to the start it begins on the spacer's edge — the same
                        vertical home's left column ends on. */}
                    <div className="relative z-100 min-h-dvh w-full max-w-[628px] border-soft-gray/[0.12] lg:border-x">
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

                    w-96 rather than a flex share: the centre column is flex-1
                    now, so an unsized gutter would fight it for width.
                    DiscoverRightRail draws at 368px and centres in what's
                    left. */}
                <aside className="sticky bottom-0 hidden w-96 shrink-0 self-end xl:block">
                    {/* pr shifts the rail left inside its slot rather than the
                        slot getting wider — widening the aside would take the
                        space out of the feed column, which is already flex-1
                        and tight at xl. */}
                    <div className="flex justify-center pr-8 pt-[82px]">
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
