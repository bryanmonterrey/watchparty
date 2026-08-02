import React from "react";
import { HomeLeftRail } from "@/components/home/home-left-rail";

// The coin alerts rail, hoisted out of the pages that used to each mount their
// own. Everything under this group — /home, /feed, /coin/<mint> — gets the same
// left column, in the same place, from one definition.
//
// A ROUTE GROUP, so the URLs are untouched: `(rails)` never appears in a path.
// That's also what keeps the rail's cost honest — AlertsRail pulls
// BidirectionalList and the realtime client, and a layout only mounts for the
// routes beneath it, so nothing else in the app pays for the import. Gating it
// by pathname from the app shell would have loaded it everywhere.
//
// The row lives here too (px-1, flex), and children take the rest. Each page
// keeps its own columns inside that: home its centre/video-rail/dock, the feed
// its column/right-rail/dock, the token page its grid.
export default function RailsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative flex min-h-screen w-full px-1">
            <HomeLeftRail />
            {/* min-w-0 so a wide child (the token page's grid, the feed's
                columns) shrinks instead of pushing the rail off-screen. */}
            <div className="flex min-w-0 flex-1">{children}</div>
        </div>
    );
}
