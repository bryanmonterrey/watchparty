import { Metadata } from "next";
import { TradeView } from "@/components/trade/trade-view";

// Port of sidebar's (browse)/trade/page.tsx; TradeView picks the desktop
// three-column board or the mobile token list per viewport.
export const metadata: Metadata = {
    title: "trade",
};

export default function TradePage() {
    return (
        <div className="h-full">
            <TradeView />
        </div>
    );
}
