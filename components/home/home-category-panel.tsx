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
            <div className="mt-8 mb-2">
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
