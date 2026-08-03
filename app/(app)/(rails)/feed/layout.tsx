import React from "react";
import { DiscoverScrollBackdrop } from "@/components/browse/discover-scroll-backdrop";
import { DiscoverRightRail } from "@/components/browse/discover-right-rail";
import { HomeActionDock } from "@/components/home/home-action-dock";

// /feed (formerly /discover) in HOME'S column frame: the feed column starts
// where the alerts rail ends, a right rail beside it, and home's action dock in
// the far gutter.
//
// The alerts rail itself comes from (rails)/layout.tsx, which /home and the
// token page share — this layout only owns what's to the right of it.
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
        // w-full min-w-0 because this is a FLEX CHILD now — (rails)/layout.tsx
        // owns the row and hands this the space beside the alerts rail. Left as
        // a bare block it would shrink-wrap its content instead of filling.
        <div className="relative w-full min-w-0">
            {/* The feed's own scroll backdrop, beneath the global header. The
                sticky h-0 wrapper overlays the top strip without pushing the
                columns down; z-40 keeps it below the feed (z-100). */}
            <div className="sticky top-0 z-40 h-0 max-md:hidden">
                <DiscoverScrollBackdrop />
            </div>

            {/* The feed's own columns. The alerts rail and the row's px-1 come
                from (rails)/layout.tsx above this one.

                The w-72 spacer that used to stand in for the rail is gone with
                it — the feed now starts where the real rail ends, including when
                it's collapsed, which a fixed-width stand-in could never do. */}
            <div className="relative flex min-h-screen w-full">
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
                <main className="relative flex w-full ml-4 min-w-0 max-w-[628px] flex-col">
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
