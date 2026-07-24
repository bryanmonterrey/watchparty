"use client";

import dynamic from "next/dynamic";
import { useIsMobileOrUndefined } from "@/hooks/use-mobile";

// Lazy per-viewport variants: conditional render (not CSS hiding) so the
// hidden variant's feed queries never fire, and dynamic() so its chunk never
// downloads — phones don't pay for the desktop feed and vice versa. Waiting
// for the measured viewport (undefined first frame) is what prevents a
// wrong-variant chunk from starting to load before the flip.
const DesktopHome = dynamic(() => import("./desktop-home2").then(m => m.DesktopHome), { ssr: false });
const MobileHome = dynamic(() => import("./mobile-home").then(m => m.MobileHome), { ssr: false });

export function HomeView() {
    const isMobile = useIsMobileOrUndefined();
    if (isMobile === undefined) return null;
    return isMobile ? <MobileHome /> : <DesktopHome />;
}
