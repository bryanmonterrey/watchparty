"use client";

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LockIcon } from "@hugeicons/core-free-icons";
import { usePremium } from "@/hooks/use-premium";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import { TIERS, meetsTier, type TierKey } from "@/lib/premium/tiers";

/**
 * Show children to entitled users, an upgrade prompt to everyone else.
 *
 * ## ⚠️ This is UX, never enforcement
 *
 * Everything here runs in the browser, so it decides what is *rendered*, not
 * what is *allowed*. Any feature worth gating must also be gated on the server —
 * `server/lib/premium-entitlement.ts` owns the one predicate, and a server-side
 * gate throws `TRPCError({ code: "FORBIDDEN" })` (or a 402 from a Route
 * Handler). Wrapping a component in this and calling it done ships the feature
 * to anyone who opens devtools.
 *
 * ## The bug this used to have
 *
 * `tier` was documented as "require this specific tier" and was only ever used
 * to pick the overlay's label. The check underneath was a bare `entitled`, so
 * `<PremiumGate tier="biz_pro">` let through **every** paying user, including
 * the cheapest individual plan — silently, and in the one place a reader would
 * assume the opposite. CLAUDE.md called it out as a trap; it is now real.
 *
 * ## What "or higher" means, since there are two ladders
 *
 * Tiers are not one line. `INDIVIDUAL_TIERS` (basic → premium) and
 * `BUSINESS_TIERS` (biz_basic → biz_pro → biz_custom) are separate ladders, so
 * "higher" is only meaningful within a ladder. The rule:
 *
 * - Same ladder → position must be at or above the requirement.
 * - Business satisfies any individual requirement (it is the strictly larger
 *   plan; that is what the original "or higher group" wording meant).
 * - Individual never satisfies a business requirement.
 *
 * ⚠️ Do NOT gate on `user.verifiedTier`. It looks like the tier field but it is
 * a *badge*, deliberately kept out of lockstep with billing and cached in the
 * session payload, so it both leaks access to lapsed subscribers and locks out
 * badge-only accounts. See CLAUDE.md.
 */

interface PremiumGateProps {
    children: ReactNode;
    /**
     * Require this tier or higher (see the ladder rules above). Omit it to
     * accept any premium entitlement. This now genuinely filters — it is not
     * just the overlay's label.
     */
    tier?: TierKey;
    /** Custom locked-state UI. Falls back to a default upgrade prompt. */
    fallback?: ReactNode;
}

export function PremiumGate({ children, tier, fallback }: PremiumGateProps) {
    const { entitled, tierKey, isLoading } = usePremium();
    const openOverlay = usePremiumOverlay((s) => s.openOverlay);

    if (isLoading) return null;
    if (entitled && meetsTier(tierKey, tier)) return <>{children}</>;
    if (fallback) return <>{fallback}</>;

    const label = tier ? TIERS[tier]?.name : "Premium";
    return (
        <button
            onClick={() => openOverlay(tier)}
            className="flex items-center gap-2 rounded-full bg-twitter/15 hover:bg-twitter/25 text-twitter px-4 h-11 text-sm font-semibold transition-colors motion-reduce:transition-none"
        >
            <HugeiconsIcon icon={LockIcon} className="size-4" />
            Unlock with {label}
        </button>
    );
}
