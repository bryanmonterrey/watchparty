import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { verificationRequests } from "@/db/schema/content";
import { and, eq } from "drizzle-orm";
import type { TierGroup } from "@/lib/premium/tiers";

// Premium subscribers get a checkmark automatically (owner decision
// 2026-07-20): individual tiers (basic/premium) → "verified", business
// tiers (biz_basic/biz_pro/biz_custom) → "business" — both are already
// sold as a listed feature on those plan cards (lib/premium/tiers.ts). No
// admin review for either; "government" has no paid tier and is never
// touched by this — stays fully manual, since anyone could otherwise pay
// their way into an impersonation-risk badge.
//
// Call this at every subscription transition (new subscribe success, tier
// upgrade/downgrade, cancel, final expiration after failed USDC pulls) —
// NOT on every successful renewal, so a badge an admin cleared by hand
// stays cleared instead of quietly reappearing next period.

async function hasApprovedRequest(userId: string): Promise<boolean> {
    const [row] = await db.select({ id: verificationRequests.id })
        .from(verificationRequests)
        .where(and(eq(verificationRequests.userId, userId), eq(verificationRequests.status, "approved")))
        .limit(1);
    return !!row;
}

/**
 * Reconciles the auto-managed badge to match the subscriber's current
 * premium tier. `group` is the subscription's tier group, or `null` when
 * the subscription has ended (cancelled or expired after retries).
 *
 * Never touches:
 * - Anyone with an admin-approved verification_requests row — that's a
 *   real identity check and must outlive an unrelated billing event.
 * - Anyone currently on "government" — not sold, always manual.
 */
export async function syncPremiumBadge(userId: string, group: TierGroup | null): Promise<void> {
    try {
        if (await hasApprovedRequest(userId)) return;

        const [row] = await db.select({ verifiedTier: user.verifiedTier }).from(user).where(eq(user.id, userId)).limit(1);
        if (!row || row.verifiedTier === "government") return;

        const desired = group === "individual" ? "verified" : group === "business" ? "business" : null;
        if (row.verifiedTier === desired) return; // already correct, no-op

        await db.update(user).set({ verifiedTier: desired }).where(eq(user.id, userId));
    } catch { /* never block the subscription flow on this */ }
}
