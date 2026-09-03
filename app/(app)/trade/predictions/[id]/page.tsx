import type { Metadata } from "next";
import { db } from "@/db";
import { predictionMarkets, predictionOutcomes } from "@/db/schema/content/predictions";
import { asc, eq } from "drizzle-orm";
import { ogImage } from "@/lib/share/og-url";
import { MarketDetail } from "@/components/predictions/market-detail";
import { fallbackShareMetadata, shareMetadata } from "@/lib/share/metadata";

// Each prediction market has its own page (like tokens do).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    try {
        const [[market], outcomes] = await Promise.all([
            db
                .select({
                    question: predictionMarkets.question,
                    description: predictionMarkets.description,
                    imageUrl: predictionMarkets.imageUrl,
                    closesAt: predictionMarkets.closesAt,
                    status: predictionMarkets.status,
                })
                .from(predictionMarkets)
                .where(eq(predictionMarkets.id, id))
                .limit(1),
            db
                .select({ label: predictionOutcomes.label, poolUsdc: predictionOutcomes.poolUsdc })
                .from(predictionOutcomes)
                .where(eq(predictionOutcomes.marketId, id))
                .orderBy(asc(predictionOutcomes.idx)),
        ]);
        if (!market) return fallbackShareMetadata(`/trade/predictions/${id}`, "market not found");

        // Implied odds = each outcome's share of the total pool; an untouched
        // market splits evenly. Pools are USDC base units (6dp).
        const pools = outcomes.map((o) => Number(o.poolUsdc) / 1e6);
        const total = pools.reduce((a, b) => a + b, 0);
        const cardOutcomes = outcomes
            .map((o, i) => ({ label: o.label, pct: total > 0 ? (pools[i] / total) * 100 : 100 / outcomes.length }))
            .sort((a, b) => b.pct - a.pct);

        return shareMetadata({
            title: market.question,
            description: market.description || "Back an outcome in USDC on watchparty.",
            path: `/trade/predictions/${id}`,
            image: ogImage("market", {
                question: market.question,
                image: market.imageUrl,
                outcomes: cardOutcomes,
                pool: total,
                closes: market.closesAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                status: market.status,
            }),
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
