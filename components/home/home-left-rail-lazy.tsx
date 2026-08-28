"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { railKeepsWidth } from "./rail-keeps-width";

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
// the placeholder holds the rail's width so the centre column does not jump
// when it lands. /feed and /coin enter the group through the same layout and
// get the same fix for free.
//
// THE PLACEHOLDER IS THE COLLAPSED RAIL, not the expanded one. The real rail
// mounts with `collapsed = true` and only expands after an effect finds an
// explicit "0" in localStorage — so for everyone who never opened it (the
// default), the first thing the rail ever paints is the w-11 strip with
// data-rail-collapsed="true". Holding w-72 here meant the centre column
// painted at its narrow cap (628px) beside a 288px blank, then widened to
// 872px the instant the chunk landed and the strip replaced the blank — the
// "smaller skeleton grows into the bigger skeleton" on every /home entry.
// Matching the collapsed shape from the first frame removes that resize
// entirely for the default case. (Someone who HAS expanded the rail still
// sees the strip briefly before the effect widens it — that is the real
// rail's own mount order, and it was already so.)
//
// keepsWidth mirrors the real rail exactly (same helper): on /feed and /status
// the collapsed rail stays w-72 and reports "false", so the placeholder does
// too, and the feed's column is left where it is.
function RailPlaceholder() {
    const keepsWidth = railKeepsWidth(usePathname());
    return (
        <aside
            aria-hidden
            data-rail-collapsed={keepsWidth ? "false" : "true"}
            className={keepsWidth ? "hidden w-72 shrink-0 lg:block" : "hidden w-11 shrink-0 lg:block"}
        />
    );
}

const HomeLeftRailInner = dynamic(
    () => import("./home-left-rail").then((m) => ({ default: m.HomeLeftRail })),
    {
        ssr: false,
        loading: RailPlaceholder,
    },
);

export function HomeLeftRailLazy() {
    return <HomeLeftRailInner />;
}
