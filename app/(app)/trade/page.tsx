import { Metadata } from "next";
import { TradeView } from "@/components/trade/trade-view";
import { ProgressiveEntry } from "@/components/app-ui/progressive-entry";
import TradeLoading from "./loading";

// Port of sidebar's (browse)/trade/page.tsx; TradeView picks the desktop
// three-column board or the mobile token list per viewport.
export const metadata: Metadata = {
    title: "trade",
};

export default function TradePage() {
    return (
        <div className="h-full">
            {/* First client commit paints the same shell loading.tsx serves;
                the board enters in a transition — see ProgressiveEntry. */}
            <ProgressiveEntry shell={<TradeLoading />}>
                <TradeView />
            </ProgressiveEntry>
        </div>
    );
}
