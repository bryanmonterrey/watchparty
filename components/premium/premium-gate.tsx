"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { usePremium } from "@/hooks/use-premium";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import { TIERS, type TierKey } from "@/lib/premium/tiers";

interface PremiumGateProps {
    children: ReactNode;
    /** Require this specific tier or higher group (default: any premium). */
    tier?: TierKey;
    /** Custom locked-state UI. Falls back to a default upgrade prompt. */
    fallback?: ReactNode;
}

/** Renders children only for entitled users; otherwise shows an upgrade prompt. */
export function PremiumGate({ children, tier, fallback }: PremiumGateProps) {
    const { entitled, isLoading } = usePremium();
    const openOverlay = usePremiumOverlay((s) => s.openOverlay);

    if (isLoading) return null;
    if (entitled) return <>{children}</>;
    if (fallback) return <>{fallback}</>;

    const label = tier ? TIERS[tier]?.name : "Premium";
    return (
        <button
            onClick={() => openOverlay(tier)}
            className="flex items-center gap-2 rounded-full bg-twitter/15 hover:bg-twitter/25 text-twitter px-4 h-11 text-sm font-semibold transition-colors"
        >
            <Lock className="size-4" />
            Unlock with {label}
        </button>
    );
}
