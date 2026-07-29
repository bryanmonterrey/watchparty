"use client";

import { RailTabs, HOME_RAIL_TABS } from "@/components/rails/rail-tabs";
import { useHomeFeed } from "./home-feed-context";

// Home's right-rail tabs. The row itself now lives in components/rails so the
// video and live rails are literally the same component — see rail-tabs.tsx for
// the design notes.
//
// Home runs its own label set (HOME_RAIL_TABS): "Feed" where the other rails say
// "For you", plus "Liked" after it. Selection lives in the feed context because
// the list this filters is a sibling, not a child.
//
// "Feed" and "Liked" filter the rail. The rest are still visual only — the same
// as before — since nothing behind them has changed.
export function HomeRailTabs() {
    const { tab, setTab } = useHomeFeed();
    return <RailTabs tabs={HOME_RAIL_TABS} active={tab} onChange={setTab} />;
}
