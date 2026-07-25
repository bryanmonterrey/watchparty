import React from "react";
import { DiscoverScrollBackdrop } from "@/components/browse/discover-scroll-backdrop";
import { DiscoverRail } from "@/components/browse/discover-rail";
import { DiscoverRightRail } from "@/components/browse/discover-right-rail";

// Discover feed — retrofit to the profile page's 3-column shell: left rail =
// sidebar width, center feed = flex-1, right rail = 340px, on a panel1
// background. The rails keep their own content (DiscoverRail / DiscoverRightRail);
// only the column widths changed (were flex gutters + a centered 628px feed).
//
// Single native scroll (#app-scroll-container), no per-column overflow. The row
// uses `items-start` (NOT stretch) so each aside is only as tall as its own
// content and `position: sticky` on the aside itself pins it against the scroller
// while the taller feed keeps the row tall — the canonical sticky-sidebar
// pattern, robust against the app shell's nested scroll context. Left rail sticks
// at top-0; the right rail sticks bottom-0 so a rail taller than the viewport
// reveals its full height as you scroll rather than freezing at the top.
export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative">
            {/* Discover's own scroll backdrop, beneath the global header. The
                sticky h-0 wrapper overlays the top strip without pushing the
                columns down; z-40 keeps it below the feed (z-100). */}
            <div className="sticky top-0 z-40 h-0 max-md:hidden">
                <DiscoverScrollBackdrop />
            </div>

            <div className="flex min-h-dvh w-full items-start bg-panel1">
                {/* Left rail — sidebar width (was a flex gutter). */}
                <aside className="sticky top-0 hidden h-dvh w-[var(--sidebar-width)] shrink-0 lg:block">
                    <DiscoverRail />
                </aside>

                {/* Center feed — flex-1 (was a centered 628px column). border-x
                    delineates it from the rails (no outer gap, mirroring profile). */}
                <div className="relative z-100 min-h-dvh min-w-0 flex-1 lg:border-x border-soft-gray/[0.12]">
                    {children}
                </div>

                {/* Right rail — 340px (was a flex gutter). DiscoverRightRail's
                    368px card column caps to it via its own max-w-full. */}
                <aside className="sticky bottom-0 hidden w-[340px] shrink-0 self-end xl:block">
                    <div className="flex justify-center pt-[82px]">
                        <DiscoverRightRail />
                    </div>
                </aside>
            </div>
        </div>
    );
}
