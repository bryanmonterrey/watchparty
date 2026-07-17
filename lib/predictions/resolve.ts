import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { predictionBets, predictionMarkets, predictionOutcomes } from "@/db/schema/content/predictions";

// Resolution core, shared by the admin tRPC procedure and the AI factory
// cron. Marks the winner and credits referral rewards (the rake comes from
// LOSING bets, so each losing bet by a referred user credits their referrer
// 10% of the rake it contributed). Best-effort; idempotent per bet.

export async function resolveMarketCore(
    marketId: string,
    winningOutcome: number,
    note?: string,
): Promise<typeof predictionMarkets.$inferSelect | null> {
    const [outcome] = await db
        .select({ id: predictionOutcomes.id })
        .from(predictionOutcomes)
        .where(and(eq(predictionOutcomes.marketId, marketId), eq(predictionOutcomes.idx, winningOutcome)))
        .limit(1);
    if (!outcome) return null;

    const [updated] = await db
        .update(predictionMarkets)
        .set({
            status: "resolved",
            winningOutcome,
            resolvedAt: new Date(),
            resolutionNote: note ?? null,
        })
        .where(and(eq(predictionMarkets.id, marketId), eq(predictionMarkets.status, "open")))
        .returning();
    if (!updated) return null;

    try {
        const { creditReferralReward } = await import("@/lib/referral/rewards");
        const bets = await db
            .select({ id: predictionBets.id, userId: predictionBets.userId, amountUsdc: predictionBets.amountUsdc, outcomeIdx: predictionBets.outcomeIdx })
            .from(predictionBets)
            .where(eq(predictionBets.marketId, updated.id));
        for (const bet of bets) {
            if (bet.outcomeIdx === updated.winningOutcome) continue;
            const rake = (bet.amountUsdc * BigInt(updated.feeBps)) / BigInt(10_000);
            if (rake <= BigInt(0)) continue;
            await creditReferralReward(bet.userId, rake, `pred:${bet.id}`, "predictions").catch(() => {});
        }
    } catch (err) {
        console.error("prediction referral rewards failed:", err);
    }

    return updated;
}
