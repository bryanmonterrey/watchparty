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

                @container/home stays on: whatever lands here should size
                against THIS column rather than the viewport. */}
            <main className="@container/home relative min-w-0 flex-1 bg-panel1 md:pt-[var(--header-height)]" />

            {/* Right rail — 340px. The extra top padding clears the fixed
                header, which would otherwise sit over the title. */}
            <aside className="hidden shrink-0 xl:block w-[340px]">
                <div className="sticky top-0 flex h-screen flex-col gap-4 p-4 md:pt-[calc(var(--header-height)+1rem)]">
                    {/* String expression rather than raw JSX text so the
                        apostrophe needs no escaping. */}
                    <h2 className="text-2xl font-semibold">{"What's happening?"}</h2>
                </div>
            </aside>
        </div>
    );
}
