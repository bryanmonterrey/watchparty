// Scheduled collector for platform-premium auto-renewals. Pulls one period's
// USDC from each due subscriber via the Solana Subscriptions program, then
// advances/expires the local row. Secret-guarded; wire to Upstash QStash now,
// Cloudflare Worker cron later (CLAUDE.md). The route works under any trigger.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creatorEarnings, premiumPlans, premiumSubscriptions, subscriptions } from "@/db/schema/content";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { chargeSubscriber } from "@/lib/chains/solana/subscriptions/collector";
import { getMerchantAddress } from "@/lib/chains/solana/subscriptions/constants";
import { PERIOD_HOURS } from "@/lib/premium/tiers";

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

    // ── Creator subscriptions (USDC, treasury-owned plans) ──────────────────
    // On-chain creator subs only (planId set); legacy stub subs are skipped.
    const merchant = getMerchantAddress();
    const dueCreator = await db
        .select()
        .from(subscriptions)
        .where(
            and(
                inArray(subscriptions.status, ["active", "past_due"]),
                lte(subscriptions.currentPeriodEnd, now),
                isNotNull(subscriptions.planId),
            ),
        )
        .limit(BATCH);

    let creatorCharged = 0;
    let creatorExpired = 0;
    let creatorFailed = 0;

    for (const sub of dueCreator) {
        if (sub.cancelAtPeriodEnd) {
            await db.update(subscriptions)
                .set({ status: "cancelled", cancelledAt: now })
                .where(eq(subscriptions.id, sub.id));
            creatorExpired++;
            continue;
        }
        if (!sub.planId || !sub.priceUsdc || !sub.subscriberWallet) {
            creatorFailed++;
            continue;
        }
        try {
            const sig = await chargeSubscriber({
                subscriber: sub.subscriberWallet,
                merchant,
                planId: sub.planId,
                amountBaseUnits: BigInt(sub.priceUsdc),
            });
            const periodHours = sub.billingCycle === "annual" ? PERIOD_HOURS.annual : PERIOD_HOURS.monthly;
            await db.update(subscriptions)
                .set({
                    status: "active",
                    currentPeriodStart: now,
                    currentPeriodEnd: new Date(now.getTime() + periodHours * 3600 * 1000),
                    lastChargeSig: sig,
                    lastChargeAt: now,
                    failedAttempts: 0,
                })
                .where(eq(subscriptions.id, sub.id));
            // Credit the creator's gross to the claimable ledger.
            await db.insert(creatorEarnings).values({
                id: nanoid(),
                creatorId: sub.creatorId,
                type: "subscription",
                amountLamports: 0,
                amountUsdc: sub.priceUsdc,
                referenceId: sub.id,
                claimed: false,
            });
            creatorCharged++;
        } catch (e) {
            const attempts = sub.failedAttempts + 1;
            const giveUp = attempts >= MAX_ATTEMPTS;
            await db.update(subscriptions)
                .set({ status: giveUp ? "expired" : "past_due", failedAttempts: attempts })
                .where(eq(subscriptions.id, sub.id));
            if (giveUp) creatorExpired++;
            else creatorFailed++;
            errors.push({ id: sub.id, error: e instanceof Error ? e.message : String(e) });
        }
    }

    return NextResponse.json({
        premium: { processed: due.length, charged, expired, failed },
        creator: { processed: dueCreator.length, charged: creatorCharged, expired: creatorExpired, failed: creatorFailed },
        errors: errors.slice(0, 20),
    });
}
