"use client";

import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { TierKey } from "@/lib/premium/tiers";

/**
 * Entitlement hook — the source of truth for gating premium features.
 * `entitled` is true while the user has an active (or past_due, in-grace)
 * premium subscription whose period hasn't ended.
 */
export function usePremium() {
    const { data: session } = useAuthSession();
    const query = trpc.premium.getStatus.useQuery(undefined, {
        enabled: !!session?.user,
        staleTime: 60_000,
    });

    return {
        isLoading: query.isLoading,
        entitled: query.data?.entitled ?? false,
        tierKey: (query.data?.subscription?.tierKey ?? null) as TierKey | null,
        group: query.data?.subscription?.group ?? null,
        subscription: query.data?.subscription ?? null,
        refetch: query.refetch,
    };
}
