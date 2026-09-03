import type { Metadata } from "next";
import { db } from "@/db";
import { predictionMarkets } from "@/db/schema/content/predictions";
import { eq } from "drizzle-orm";
import { MarketDetail } from "@/components/predictions/market-detail";
import { fallbackShareMetadata, shareMetadata } from "@/lib/share/metadata";

// Each prediction market has its own page (like tokens do).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    try {
        const [market] = await db
            .select({ question: predictionMarkets.question, description: predictionMarkets.description })
            .from(predictionMarkets)
            .where(eq(predictionMarkets.id, id))
            .limit(1);
        if (!market) return fallbackShareMetadata(`/trade/predictions/${id}`, "market not found");
        return shareMetadata({
            title: market.question,
            description: market.description || "Back an outcome in USDC on watchparty.",
            path: `/trade/predictions/${id}`,
        });
    } catch {
        return fallbackShareMetadata(`/trade/predictions/${id}`, "predictions");
    }
}

export default async function PredictionMarketPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <div className="h-full">
            <MarketDetail marketId={id} />
        </div>
    );
}
