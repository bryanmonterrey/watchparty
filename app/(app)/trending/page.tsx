import type { Metadata } from "next";
import { TrendingTable } from "@/components/trending/trending-table";

// /trending — the market-wide, every-chain coin board ("overall crypto
// atmosphere"). Distinct from /trade, which is watchparty's OWN coins and their
// trading surface; this one is the outside market.
//
// The page is intentionally thin: TrendingTable owns its queries and filter
// state, so mounting the board somewhere else later is an import.
export const metadata: Metadata = {
    title: "Trending",
};

export default function TrendingPage() {
    return (
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-[calc(var(--header-height)+16px)] lg:px-6">
            <TrendingTable />
        </div>
    );
}
