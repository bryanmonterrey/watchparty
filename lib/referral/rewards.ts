// Referral reward accrual — called after every SUCCESSFUL platform-premium
// charge (first charge at signup + every renewal). Referrers earn
// REWARD_BPS of the payment for the referral's first REWARD_WINDOW_DAYS.
// Best-effort by contract: callers wrap in try/catch — a reward hiccup must
// never fail a charge that succeeded. The UNIQUE reference makes retries safe.
import { db } from "@/db";
import { referrals, referralEarnings } from "@/db/schema/content/referral";
import { user } from "@/db/schema/auth";
import { eq } from "drizzle-orm";

export const REWARD_BPS = 1000; // 10%
export const REWARD_WINDOW_DAYS = 365;

/**
 * Credit the referrer's cut of a premium payment, if the payer was referred
 * and the referral is still inside the reward window.
 *
 * @param payerUserId  the user whose premium charge succeeded
 * @param amountBaseUnits  the charge amount in USDC base units
 * @param reference  idempotency key — charge signature (or sub+period)
 */
export async function creditReferralReward(
    payerUserId: string,
    amountBaseUnits: bigint,
    reference: string,
): Promise<void> {
    const [payer] = await db
        .select({ referredBy: user.referredBy })
        .from(user)
        .where(eq(user.id, payerUserId))
        .limit(1);
    if (!payer?.referredBy) return;

    // Window: 12 months from when the referral completed.
    const [ref] = await db
        .select({ completedAt: referrals.completedAt, createdAt: referrals.createdAt })
        .from(referrals)
        .where(eq(referrals.referredUserId, payerUserId))
        .limit(1);
    const startedAt = ref?.completedAt ?? ref?.createdAt;
    if (!startedAt) return;
    if (Date.now() - startedAt.getTime() > REWARD_WINDOW_DAYS * 24 * 3600 * 1000) return;

    const cut = (amountBaseUnits * BigInt(REWARD_BPS)) / BigInt(10_000);
    if (cut <= BigInt(0)) return;

    await db
        .insert(referralEarnings)
        .values({
            referrerId: payer.referredBy,
            referredUserId: payerUserId,
            amountUsdc: cut,
            source: "premium",
            reference,
        })
        .onConflictDoNothing();
}
