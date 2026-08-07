import { db } from "@/db";
import { premiumSubscriptions } from "@/db/schema/content";
import { eq } from "drizzle-orm";
import { TIERS, type TierKey } from "@/lib/premium/tiers";

// The single source of truth for "does this user have platform premium right
// now". Extracted because the predicate below was copy-pasted in two places
// (premium.getStatus and community.ts's boostAllowance) and a third copy was
// about to appear for the assistant — three chances to drift on a rule that
// decides who gets charged for what.
//
// Two things about this predicate that are easy to get wrong, both deliberate:
//
//   - `past_due` COUNTS AS ENTITLED. It's the grace window while the collector
//     retries a failed pull (app/api/cron/premium-collect). Dropping someone
//     the instant a charge bounces would punish them for a network blip.
//   - `currentPeriodEnd` is the real gate, not `status`. A subscription whose
//     very first charge failed is written with `periodEnd = now`, so the time
//     comparison is what actually rejects it.
//
// Do NOT gate on `user.verifiedTier` instead. That's a BADGE
// ("verified" | "business" | "government"), it's intentionally not kept in
// lockstep with billing (server/lib/premium-verified.ts skips it for
// admin-approved verification requests and never re-applies it on renewal),
// and it's cached in the session payload so it goes stale. Entitlement is this
// row or nothing.

export type PremiumEntitlement = {
    entitled: boolean;
    tierKey: TierKey | null;
    group: "individual" | "business" | null;
    status: string | null;
    /** Billing period boundary — also the natural reset point for any quota. */
    currentPeriodEnd: Date | null;
};

const NONE: PremiumEntitlement = {
    entitled: false,
    tierKey: null,
    group: null,
    status: null,
    currentPeriodEnd: null,
};

/**
 * The predicate itself, for callers that already hold the row — `premium.getStatus`
 * selects the whole record for the settings UI and shouldn't pay for a second
 * query just to reuse the rule.
 */
export function isEntitled(row: {
    status: string | null;
    currentPeriodEnd: Date | null;
}): boolean {
    if (!row.currentPeriodEnd) return false;
    return (
        (row.status === "active" || row.status === "past_due") &&
        row.currentPeriodEnd.getTime() > Date.now()
    );
}

export async function getPremiumEntitlement(userId: string): Promise<PremiumEntitlement> {
    const [row] = await db
        .select({
            tierKey: premiumSubscriptions.tierKey,
            status: premiumSubscriptions.status,
            currentPeriodEnd: premiumSubscriptions.currentPeriodEnd,
        })
        .from(premiumSubscriptions)
        .where(eq(premiumSubscriptions.userId, userId))
        .limit(1);

    if (!row) return NONE;

    const tierKey = row.tierKey as TierKey;

    return {
        entitled: isEntitled(row),
        tierKey,
        group: TIERS[tierKey]?.group ?? "individual",
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
    };
}
