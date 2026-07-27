import type { Metadata } from "next";
import { HomeCategoryPanel } from "@/components/home/home-category-panel";
import { HomeRailTabs } from "@/components/home/home-rail-tabs";
import { HomeFeedProvider } from "@/components/home/home-feed-context";
import { HomeHero } from "@/components/home/home-hero";
import { HomeRailVideos } from "@/components/home/home-rail-videos";
import { HomeLeftRail } from "@/components/home/home-left-rail";

// Home is a 3-column frame: rails either side of a single content column, one
// native scroll for the whole row.
//
// The LEFT rail is the exception to "no per-column overflow": it hosts the coin
// alert feed, which is unbounded and constantly appending, so it scrolls inside
// its own sticky column instead of stretching the page. The centre column and
// right rail still ride the app scroller.
//
// The old HomeView (desktop/mobile switcher, ssr:false) is retired — mobile
// web is gated by DesktopOnlyGate and the phone experience is the Expo app.
// The previous centre-column content still lives in components/home/
// desktop-home2.tsx (hero + categories + IRL); render <DesktopHome /> inside
// <main> to bring it back.
export const metadata: Metadata = {
    title: "Home",
};

// The rails pin at the scroller's top, so their own padding is what clears the
// fixed header — the centre column's mt doesn't apply to them.
const RAIL_INNER = "sticky top-0 flex h-screen flex-col md:pt-[calc(var(--header-height)+4px)]";
// The right rail sits against the window edge, so it runs tighter there than
// the p-4 it carries everywhere else. gap-4 separates its tab row from the
// video list; the left rail is one component and sets its own spacing, so the
// gap is declared per rail rather than on the shared base (two conflicting
// `gap-*` utilities on one element resolve by stylesheet order, not by which
// one is written last).
const RAIL_INNER_RIGHT = `${RAIL_INNER} gap-4 pr-1`;
// The left rail carries its own copy of this (it owns its <aside> so it can
// collapse) — see components/home/home-left-rail.tsx.

export default function AppHome() {
    // Left rail from lg, right rail from xl, centre column taking the rest.
    //
    // The gutters are asymmetric (4 left, 1.25 right), so a single `gap` on the
    // row can't express them — but they hang off the CENTRE column, not the
    // rails. A margin on a rail counts toward that rail's own footprint, which
    // is what made the left one measure wider than its declared w-70; putting
    // both on the centre column leaves each rail exactly the width it declares.
    return (
        // Wraps the whole row: the hero sits in <main> and its picker in the
        // <aside>, so the provider has to be an ancestor of both.
        <HomeFeedProvider>
        <div className="relative flex min-h-screen w-full">
            {/* Left rail: the coin alert feed. It scrolls INSIDE the sticky
                column (min-h-0 on the rail is what allows that), so the page's
                own scroll is unaffected by however many alerts have landed.
                Owns its own <aside> because it's collapsible — see the
                component for why that has to be a client boundary. */}
            <HomeLeftRail />

            {/* Centre column. Its fill is NOT one continuous slab: the screen
                is its own panel, then a gap-8 of bare app canvas, then the fill
                picks up again for everything below it.

                The header offset is a MARGIN, not padding: padding would keep
                the fill starting at y=0 and running behind the fixed header,
                where a margin starts it below and leaves the header band on the
                app canvas.

                @container/home stays on: whatever lands here should size
                against THIS column rather than the viewport. */}
            <main className="@container/home relative flex min-w-0 flex-1 flex-col md:mt-[var(--header-height)] lg:ml-4 xl:mr-1.25">
                {/* The screen — 16:9, holding the featured video. The slot owns
                    the aspect ratio; the player just fills it.

                    Deliberately NOT overflow-hidden: the hero runs the watch
                    page's ambient glow, which paints a blurred copy of the
                    frame past the video's edges. Any clipping ancestor between
                    the video and where the glow should fade removes the effect
                    entirely. */}
                <div className="relative aspect-video w-full bg-sidebar-hover/25">
                    <HomeHero />
                </div>

                {/* Category tabs plus the selected tab's content, in the gap on
                    bare canvas. Spacing is set per edge rather than by a column
                    `gap`, because the two sides are no longer equal: a full
                    gap-8 off the screen above, and half that to the row below,
                    which the tabs belong to. The panel owns both, since the
                    selection has to drive what renders under it. */}
                <HomeCategoryPanel />
            </main>

            {/* Right rail. Its tab row leads with the icon — the icon is the
                first tab rather than a heading sitting above them. */}
            <aside className="hidden w-75 shrink-0 xl:block">
                <div className={RAIL_INNER_RIGHT}>
                    <HomeRailTabs />
                    {/* The hero's picker: selecting a row swaps the screen. */}
                    <HomeRailVideos />
                </div>
            </aside>
        </div>
        </HomeFeedProvider>
    );
}
