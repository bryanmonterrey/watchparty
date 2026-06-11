"use client";

import dynamic from "next/dynamic";
import { useIsMobileOrUndefined } from "@/hooks/use-mobile";

// Lazy per-viewport variants — see HomeView for the pattern rationale: only
// the active variant queries/subscribes AND only its chunk downloads.
const TradeFeed = dynamic(() => import("./trade-feed").then(m => m.TradeFeed), { ssr: false });
const MobileTrade = dynamic(() => import("./mobile-trade").then(m => m.MobileTrade), { ssr: false });

export function TradeView() {
    const isMobile = useIsMobileOrUndefined();
    if (isMobile === undefined) return null;
    return isMobile ? <MobileTrade /> : <TradeFeed />;
}
