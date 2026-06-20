"use client";

import { trpc } from "@/lib/trpc/client";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import { TIERS, type TierKey } from "@/lib/premium/tiers";
import { Crown, Loader2 } from "lucide-react";
import { appToast } from "@/components/app-ui/app-toast";
import { Skeleton } from "@/components/ui/skeleton";

export function PremiumSettings() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.premium.getStatus.useQuery();
    const openOverlay = usePremiumOverlay((s) => s.openOverlay);
    const cancel = trpc.premium.cancel.useMutation({
        onSuccess: async () => {
            await utils.premium.getStatus.invalidate();
            appToast.success("Auto-renew turned off. Access lasts until the period ends.");
        },
        onError: (e) => appToast.error(e.message),
    });

    if (isLoading) return <Skeleton className="h-40 rounded-xl" />;

    const sub = data?.subscription;
    const active = data?.entitled && sub;

    if (!active) {
        return (
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-6 text-center">
                <Crown className="mx-auto size-8 text-twitter" />
                <p className="mt-3 font-semibold text-zinc-100">You&apos;re not on Premium</p>
                <p className="mt-1 text-sm text-zinc-400">
                    Unlock verified badges, higher limits, analytics and more.
                </p>
                <button
                    onClick={() => openOverlay()}
                    className="mt-4 rounded-full bg-white text-zinc-950 font-bold px-6 h-control hover:bg-zinc-200 transition-colors"
                >
                    Upgrade to Premium
                </button>
            </div>
        );
    }

    const tier = TIERS[sub.tierKey as TierKey];
    return (
        <div className="space-y-4">
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Crown className="size-5 text-twitter" />
                        <div>
                            <p className="font-bold text-zinc-100">{tier?.name ?? sub.tierKey}</p>
                            <p className="text-xs text-zinc-400 capitalize">
                                {sub.billingCycle} · {sub.status.replace("_", " ")}
                            </p>
                        </div>
                    </div>
                    <span className="text-xs text-zinc-500">
                        {sub.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
                        {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    </span>
                </div>

                <div className="mt-4 flex gap-2">
                    <button
                        onClick={() => openOverlay()}
                        className="rounded-full bg-white/10 hover:bg-white/20 text-zinc-100 font-semibold px-4 h-control text-sm transition-colors"
                    >
                        Change plan
                    </button>
                    {!sub.cancelAtPeriodEnd && (
                        <button
                            onClick={() => cancel.mutate(undefined)}
                            disabled={cancel.isPending}
                            className="flex items-center gap-2 rounded-full bg-transparent hover:bg-red-500/10 text-red-400 font-semibold px-4 h-control text-sm transition-colors disabled:opacity-50"
                        >
                            {cancel.isPending && <Loader2 className="size-4 animate-spin" />}
                            Cancel auto-renew
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
