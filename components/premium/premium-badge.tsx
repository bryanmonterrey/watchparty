"use client";

import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIERS, type TierKey } from "@/lib/premium/tiers";

/**
 * X-style verified badge for premium members. Business tiers get a gold mark,
 * individual tiers a blue one. Pass the member's tier (or null to render nothing).
 */
export function PremiumBadge({
    tierKey,
    className,
}: {
    tierKey: TierKey | null | undefined;
    className?: string;
}) {
    if (!tierKey) return null;
    const isBusiness = TIERS[tierKey]?.group === "business";
    return (
        <BadgeCheck
            aria-label={isBusiness ? "Verified organization" : "Premium member"}
            className={cn(
                "size-4 shrink-0",
                isBusiness ? "text-amber-400" : "text-twitter",
                className,
            )}
        />
    );
}
