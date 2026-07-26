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

// Both rails are the same width so the centre column is optically centred; the
// content column takes whatever is left.
const RAIL = "sticky top-[var(--header-height)] hidden h-[calc(100dvh-var(--header-height))] w-[260px] shrink-0 xl:block 2xl:w-[320px] min-[1800px]:w-[368px]";

export default function AppHome() {
    return (
        <div className="flex min-h-dvh w-full items-start gap-6 px-4">
            <aside aria-hidden className={RAIL} />

            {/* Centre column: the content surface — bg-panel1 (#0D0D0D), the
                same fill as the profile banner, sitting on the app scroller's
                lighter bg-panel. The header is fixed and pointer-events-none,
                so the fill runs from the top of the scroller and only the
                content is padded clear of it.

                @container/home so the sections inside size against THIS column
                rather than the viewport — without it the trending/IRL grids
                keep counting viewport breakpoints they no longer own. */}
            <div className="@container/home min-h-dvh min-w-0 flex-1 bg-panel1 md:pt-[var(--header-height)]">
                <DesktopHome />
            </div>

            <aside aria-hidden className={RAIL} />
        </div>
    );
}
