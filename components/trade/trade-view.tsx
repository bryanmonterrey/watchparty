"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { TradeFeed } from "./trade-feed";
import { MobileTrade } from "./mobile-trade";

// Conditional render so only the active variant queries/subscribes.
export function TradeView() {
    const isMobile = useIsMobile();
    return isMobile ? <MobileTrade /> : <TradeFeed />;
}
