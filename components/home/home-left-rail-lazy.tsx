"use client";

import dynamic from "next/dynamic";

// The rails layout's own comment calls AlertsRail the deliberately-heavy
// import — BidirectionalList plus the realtime client. Statically imported
// from the (rails) LAYOUT, that chunk sat on the navigation's critical path:
// entering the group from anywhere else downloaded it before ANYTHING could
// paint, including /home's loading shell, because a layout's client modules
// are outside every loading boundary below them. That was the reported
// "navigating to /home takes a bit and no skeleton ever shows".
//
// ssr:false + this wrapper takes it off that path: the layout's immediate
// client module is this file (tiny), the rail's chunk loads after commit, and
// the fallback holds the rail's expanded width so the centre column does not
// jump when it lands. /feed and /coin enter the group through the same layout
// and get the same fix for free.
const HomeLeftRailInner = dynamic(
    () => import("./home-left-rail").then((m) => ({ default: m.HomeLeftRail })),
    {
        ssr: false,
        loading: () => <div className="hidden w-72 shrink-0 lg:block" aria-hidden />,
    },
);

export function HomeLeftRailLazy() {
    return <HomeLeftRailInner />;
}
