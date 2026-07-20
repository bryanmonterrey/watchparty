import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { verificationRequests } from "@/db/schema/content";
import { and, eq, isNull } from "drizzle-orm";

// Premium subscribers get the verified checkmark automatically (owner
// decision 2026-07-20: the manual verification_requests admin-approval flow
// is effectively redundant now for the base "verified" tier — signing up for
// premium is the path). Business/government stay admin-only: grant never
// overwrites an existing tier, and revoke never touches anything but exactly
// "verified". Both are idempotent, safe to call on every relevant status
// transition, and never throw (callers fire-and-forget).

/** Called once, when a subscription first charges successfully. */
export async function grantPremiumVerified(userId: string): Promise<void> {
    try {
        await db.update(user)
            .set({ verifiedTier: "verified" })
            .where(and(eq(user.id, userId), isNull(user.verifiedTier)));
    } catch { /* never block the subscription flow on this */ }
}

/**
 * Called when a subscription terminally lapses (cancelled or expired after
 * retries) — NOT on a deferred cancel-at-period-end, which still owns the
 * badge until the period actually ends.
 *
 * Skips users who were separately admin-approved via verification_requests
 * (status "approved") — that's a real identity-verification grant and must
 * outlive an unrelated premium cancellation, even though it landed on the
 * same enum value as the auto-granted one.
 */
export async function revokePremiumVerified(userId: string): Promise<void> {
    try {
        const [approved] = await db.select({ id: verificationRequests.id })
            .from(verificationRequests)
            .where(and(eq(verificationRequests.userId, userId), eq(verificationRequests.status, "approved")))
            .limit(1);
        if (approved) return;

        await db.update(user)
            .set({ verifiedTier: null })
            .where(and(eq(user.id, userId), eq(user.verifiedTier, "verified")));
    } catch { /* never block the subscription flow on this */ }
}
