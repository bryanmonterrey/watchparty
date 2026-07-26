import type { Metadata } from "next";
import { DesktopHome } from "@/components/home/desktop-home2";

// Home is a 3-column frame (same model as discover/layout.tsx): sticky side
// rails around a single content column, one native scroll for the whole row —
// no per-column overflow. The rails are intentionally empty; the geometry
// lands first and their content follows.
//
// The old HomeView (desktop/mobile switcher, ssr:false) is retired — mobile
// web is gated by DesktopOnlyGate and the phone experience is the Expo app —
// so DesktopHome is imported directly and renders on the server.
export const metadata: Metadata = {
    title: "Home",
};

export default function AppHome() {
    // Geometry is deliberately identical to the profile page's channel layout
    // (components/profile/user-profile.tsx): left rail at the sidebar width
    // from lg, right rail at 340px from xl, centre column taking the rest —
    // no gaps, no outer padding. Two pages, one frame.
    return (
        <div className="relative flex min-h-screen w-full">
            {/* Left rail — sidebar width. Content TBD. */}
            <aside className="hidden shrink-0 lg:block w-[var(--sidebar-width)]">
                <div className="sticky top-0 flex h-screen flex-col gap-4 p-4" />
            </aside>

            {/* Centre column: the content surface — bg-panel1 (#0D0D0D), the
                same fill as the profile banner, sitting on the app scroller's
                lighter bg-panel. The header is fixed and pointer-events-none,
                so the fill runs from the top of the scroller and only the
                content is padded clear of it.

                @container/home so the sections inside size against THIS column
                rather than the viewport — without it the trending/IRL grids
                keep counting viewport breakpoints they no longer own. */}
            <main className="@container/home relative min-w-0 flex-1 bg-panel1 md:pt-[var(--header-height)]">
                <DesktopHome />
            </main>

            {/* Right rail — 340px. Content TBD. */}
            <aside className="hidden shrink-0 xl:block w-[340px]">
                <div className="sticky top-0 flex h-screen flex-col gap-4 p-4" />
            </aside>
        </div>
    );
}
