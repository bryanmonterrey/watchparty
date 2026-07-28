"use client";

import { useState } from "react";
import { RailTabs, RAIL_ICON_TAB } from "@/components/rails/rail-tabs";

// Home's right-rail tabs. The row itself now lives in components/rails so the
// video and live rails are literally the same component — see rail-tabs.tsx for
// the design notes.
//
// Still visual only HERE: picking one recolours it and nothing else, because
// this rail's content is the hero picker and doesn't filter. The video and live
// rails do run content off these tabs (rail-video-list.tsx).
export function HomeRailTabs() {
    const [active, setActive] = useState(RAIL_ICON_TAB);
    return <RailTabs active={active} onChange={setActive} />;
}
