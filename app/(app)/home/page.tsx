import type { Metadata } from "next";

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

// Both rails are the sidebar's width, so the centre column sits dead centre.
const RAIL = "hidden shrink-0 w-[var(--sidebar-width)]";
const RAIL_INNER = "sticky top-0 flex h-screen flex-col gap-4 p-4";

export default function AppHome() {
    // Geometry follows the profile page's channel layout
    // (components/profile/user-profile.tsx): left rail from lg, right rail from
    // xl, centre column taking the rest — no gaps, no outer padding. The one
    // divergence is the right rail's width, which matches the left here rather
    // than profile's 340px.
    return (
        <div className="relative flex min-h-screen w-full">
            {/* Left rail. Content TBD. */}
            <aside className={`${RAIL} lg:block`}>
                <div className={RAIL_INNER} />
            </aside>

            {/* Centre column: the content surface — bg-panel1 (#0D0D0D), the
                same fill as the profile banner, sitting on the app scroller's
                lighter bg-panel.

                The header offset is a MARGIN, not padding: padding would keep
                the fill starting at y=0 and running behind the fixed header,
                where a margin starts the fill below it and leaves the header
                band on the app canvas. The column still stretches to the row's
                full height, so the fill runs header-bottom → page-bottom.

                @container/home stays on: whatever lands here should size
                against THIS column rather than the viewport. */}
            <main className="@container/home relative min-w-0 flex-1 bg-panel1 md:mt-[var(--header-height)]" />

            {/* Right rail. Content TBD. */}
            <aside className={`${RAIL} xl:block`}>
                <div className={RAIL_INNER} />
            </aside>
        </div>
    );
}
