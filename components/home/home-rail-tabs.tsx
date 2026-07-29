"use client";

import { RailTabs, HOME_RAIL_TABS, HOME_TAB_CLIPS } from "@/components/rails/rail-tabs";
import { useClipsOverlay } from "@/hooks/use-clips-overlay";
import { useHomeFeed } from "./home-feed-context";

// Home's right-rail tabs. The row itself now lives in components/rails so the
// video and live rails are literally the same component — see rail-tabs.tsx for
// the design notes.
//
// Home runs its own label set (HOME_RAIL_TABS): "Feed" where the other rails say
// "For you", plus "Liked" after it. Selection lives in the feed context because
// the list this filters is a sibling, not a child.
//
// "Feed" and "Liked" filter the rail. "Clips" opens the shorts overlay and is
// deliberately NOT recorded as the active tab — it's a door, so the tab you were
// on is still the tab you return to. The rest are still visual only.
export function HomeRailTabs() {
    const { tab, setTab } = useHomeFeed();
    const openClips = useClipsOverlay((s) => s.onOpen);

    return (
        <RailTabs
            tabs={HOME_RAIL_TABS}
            active={tab}
            onChange={(next) => (next === HOME_TAB_CLIPS ? openClips() : setTab(next))}
        />
    );
}
