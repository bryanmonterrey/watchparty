"use client";

import dynamic from "next/dynamic";
import { PerpsSkeleton } from "./perps-skeleton";

// The perps view pulls the Flash SDK graph + lightweight-charts — keep the
// whole thing out of the route's initial chunk (the speed rule). The chunk
// loader and the view's own markets-loading state share PerpsSkeleton, so
// the user sees ONE continuous loading surface, not two.
const PerpsView = dynamic(
    () => import("./perps-view").then((m) => m.PerpsView),
    {
        ssr: false,
        loading: () => <PerpsSkeleton />,
    },
);

export function PerpsLoader({ geoBlocked = false }: { geoBlocked?: boolean }) {
    return <PerpsView geoBlocked={geoBlocked} />;
}
