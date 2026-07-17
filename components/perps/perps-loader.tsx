"use client";

import dynamic from "next/dynamic";

// The perps view pulls the Flash SDK graph + lightweight-charts — keep the
// whole thing out of the route's initial chunk (the speed rule).
const PerpsView = dynamic(
    () => import("./perps-view").then((m) => m.PerpsView),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full items-center justify-center">
                <div className="h-3.5 w-40 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
            </div>
        ),
    },
);

export function PerpsLoader({ geoBlocked = false }: { geoBlocked?: boolean }) {
    return <PerpsView geoBlocked={geoBlocked} />;
}
