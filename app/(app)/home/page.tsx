import type { Metadata } from "next";
import { HomeCategoryTabs } from "@/components/home/home-category-tabs";
import { HomeRailTabs } from "@/components/home/home-rail-tabs";

// Home is a 3-column frame: rails either side of a single content column, one
// native scroll for the whole row — no per-column overflow. All three columns
// are intentionally empty right now; the geometry lands first and the content
// follows.
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
const RAIL_INNER = "sticky top-0 flex h-screen flex-col gap-4 p-4 md:pt-[calc(var(--header-height)+4px)]";
// The right rail sits against the window edge, so it runs tighter there than
// the p-4 it carries everywhere else.
const RAIL_INNER_RIGHT = `${RAIL_INNER} pr-2`;

export default function AppHome() {
    // Left rail from lg, right rail from xl, centre column taking the rest.
    // The two gutters differ (4 left, 1.25 right), so they are margins on the
    // rails rather than one `gap` on the row.
    return (
        <div className="relative flex min-h-screen w-full">
            {/* Left rail. Content TBD. */}
            <aside className="hidden w-70 shrink-0 lg:mr-4 lg:block">
                <div className={RAIL_INNER} />
            </aside>

            {/* Centre column. Its fill is NOT one continuous slab: the screen
                is its own panel, then a gap-8 of bare app canvas, then the fill
                picks up again for everything below it.

                The header offset is a MARGIN, not padding: padding would keep
                the fill starting at y=0 and running behind the fixed header,
                where a margin starts it below and leaves the header band on the
                app canvas.

                @container/home stays on: whatever lands here should size
                against THIS column rather than the viewport. */}
            <main className="@container/home relative flex min-w-0 flex-1 flex-col md:mt-[var(--header-height)]">
                {/* The screen — 16:9, bg-panel1 (#0D0D0D, the profile banner's
                    fill). Aspect-driven because nothing sets its height yet. */}
                <div className="aspect-video w-full bg-sidebar-hover/25" />

                {/* Category tabs, in the gap on bare canvas. Spacing is set per
                    edge rather than by a column `gap`, because the two sides are
                    no longer equal: a full gap-8 off the screen above, and half
                    that to the row below, which the tabs belong to. */}
                <div className="mt-8 mb-2">
                    <HomeCategoryTabs />
                </div>

                {/* Everything under the tabs: the fill starts over here and
                    runs to the bottom of the column. */}
                <div className="flex-1 bg-sidebar-hover/25" />
            </main>

            {/* Right rail. Its tab row leads with the icon — the icon is the
                first tab rather than a heading sitting above them. */}
            <aside className="hidden w-75 shrink-0 xl:ml-1.25 xl:block">
                <div className={RAIL_INNER_RIGHT}>
                    <HomeRailTabs />
                </div>
            </aside>
        </div>
    );
}
