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
            {/* NO ProgressiveEntry here, deliberately. It renders the shell a
                SECOND time — the route already streams loading.tsx — and the
                swap between the two left a near-blank frame before the board
                painted: measured 2026-08-21 as shell at 1.9s (168 skeletons,
                i.e. both copies), a 4-skeleton gap at 3.5s, then the table's
                own skeleton at 4.0s. Three states where there should be one,
                which is what the owner kept seeing as "two loading states".
                /home still uses it and should: its mount is the squircle-heavy
                one that work was for. This board's row washes lost their
                clip-paths, so it has nothing left to hide behind a shell. */}
            <TradeView />
        </div>
    );
}
