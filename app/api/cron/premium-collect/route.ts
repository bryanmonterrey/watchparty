// Scheduled collector for platform-premium auto-renewals. Pulls one period's
// USDC from each due subscriber via the Solana Subscriptions program, then
// advances/expires the local row. Secret-guarded; wire to Upstash QStash now,
// Cloudflare Worker cron later (CLAUDE.md). The route works under any trigger.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { premiumPlans, premiumSubscriptions } from "@/db/schema/content";
import { and, eq, inArray, lte } from "drizzle-orm";
import { chargeSubscriber } from "@/lib/chains/solana/subscriptions/collector";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ATTEMPTS = 4; // past_due → expired after this many failed pulls
const BATCH = 50;

export async function GET(req: NextRequest) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const due = await db
        .select()
        .from(premiumSubscriptions)
        .where(
            and(
                inArray(premiumSubscriptions.status, ["active", "past_due"]),
                lte(premiumSubscriptions.currentPeriodEnd, now),
            ),
        )
        .limit(BATCH);

    // Plan terms (planId, amount, merchant) keyed by (tier, cycle).
    const plans = await db.select().from(premiumPlans);
    const planBy = new Map<string, (typeof plans)[number]>();
    for (const p of plans) planBy.set(`${p.tierKey}:${p.billingCycle}`, p);

    let charged = 0;
    let expired = 0;
    let failed = 0;
    const errors: { id: string; error: string }[] = [];

    for (const sub of due) {
        // Cancellation requested → let the period lapse, don't renew.
        if (sub.cancelAtPeriodEnd) {
            await db
                .update(premiumSubscriptions)
                .set({ status: "cancelled", cancelledAt: now })
                .where(eq(premiumSubscriptions.id, sub.id));
            expired++;
            continue;
        }

        const plan = planBy.get(`${sub.tierKey}:${sub.billingCycle}`);
        if (!plan) {
            errors.push({ id: sub.id, error: "plan not provisioned" });
            failed++;
            continue;
        }

        try {
            const sig = await chargeSubscriber({
                subscriber: sub.subscriberWallet,
                merchant: plan.collector,
                planId: plan.planId,
                amountBaseUnits: BigInt(plan.priceUsdcBaseUnits),
            });
            const periodEnd = new Date(now.getTime() + plan.periodHours * 3600 * 1000);
            await db
                .update(premiumSubscriptions)
                .set({
                    status: "active",
                    currentPeriodStart: now,
                    currentPeriodEnd: periodEnd,
                    lastChargeSig: sig,
                    lastChargeAt: now,
                    failedAttempts: 0,
                })
                .where(eq(premiumSubscriptions.id, sub.id));
            charged++;
        } catch (e) {
            const attempts = sub.failedAttempts + 1;
            const giveUp = attempts >= MAX_ATTEMPTS;
            await db
                .update(premiumSubscriptions)
                .set({
                    status: giveUp ? "expired" : "past_due",
                    failedAttempts: attempts,
                })
                .where(eq(premiumSubscriptions.id, sub.id));
            if (giveUp) expired++;
            else failed++;
            errors.push({ id: sub.id, error: e instanceof Error ? e.message : String(e) });
        }
    }

    return NextResponse.json({
        processed: due.length,
        charged,
        expired,
        failed,
        errors: errors.slice(0, 20),
    });
}
