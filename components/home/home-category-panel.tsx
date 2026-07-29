"use client";

import { useState } from "react";
import { HomeCategoryTabs, HOME_TABS } from "./home-category-tabs";
import { TrendingTable } from "@/components/trending/trending-table";

// Home's category tabs plus whatever the selected tab shows.
//
// A client component because the selection has to drive the content below it,
// and the page is a server component. It also owns the spacing that used to sit
// in the page: a full gap above the tabs (bare canvas under the screen) and
// half that below, since the tabs belong to the row they filter.
//
// "Trending Coins" is the only tab wired to content so far; the rest keep the
// previous placeholder fill, so adding one is a case in the switch below.

export function HomeCategoryPanel() {
    const [active, setActive] = useState(HOME_TABS[0]);

    return (
        <>
            {/* The tabs pin under the app header once you scroll past them, so
                the filter for the board stays reachable while you're down in it.
                Details that matter:

                · top matches the header's own height, and the breakpoint mirrors
                  the centre column's md:mt-[var(--header-height)] — below md the
                  fixed header is hidden (max-md:hidden), so there's nothing to
                  offset against.
                · the fill is the OPAQUE #080808, not bg-panel. bg-panel is
                  rgba(255,255,255,0.03) — translucent — so the board would show
                  through the tabs as it scrolled under them. #080808 is exactly
                  what that 3% white composites to over the black canvas, which
                  is why it's the literal used for this surface elsewhere.
                · pb-2 rather than mb-2: a margin isn't painted, so the gap under
                  a stuck bar would be a transparent slot with rows sliding
                  through it.
                · z-20 clears the row above (relative z-10) and stays under the
                  app header (z-50). */}
            <div className="sticky top-0 z-20 bg-[#080808] pb-2 md:top-[var(--header-height)]">
                <HomeCategoryTabs active={active} onChange={setActive} />
            </div>

            {/* No fill — everything under the tabs sits straight on the app
                canvas. */}
            <div className="flex-1">
                {active === "Trending Coins" && <TrendingTable />}
            </div>
        </>
    );
}
