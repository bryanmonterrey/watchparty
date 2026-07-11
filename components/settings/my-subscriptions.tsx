"use client";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

const SOL = 1_000_000_000;
function lamportsToSol(l: number) {
    return (l / SOL).toFixed(3).replace(/\.?0+$/, "");
}

export function MySubscriptions() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.subscription.getMySubscriptions.useQuery();
    const cancel = trpc.subscription.cancelSubscription.useMutation({
        onSuccess: () => { utils.subscription.getMySubscriptions.invalidate(); toast.success("Subscription cancelled"); },
    });

    if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

    if (!data?.length) return (
        <div className="text-center py-12 space-y-2">
            <Crown className="w-10 h-10 mx-auto text-zinc-700" />
            <p className="text-sm text-zinc-500">No active subscriptions</p>
        </div>
    );

    return (
        <div className="space-y-2">
            {data.map(sub => (
                <div key={sub.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/10">
                    <Link href={`/${sub.creator.username}`}>
                        {sub.creator.avatar_url
                            ? <img src={sub.creator.avatar_url} className="w-10 h-10 rounded-full object-cover" alt={sub.creator.name} />
                            : <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold">{sub.creator.name?.[0]}</div>
                        }
                    </Link>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-zinc-200 truncate">{sub.creator.name}</p>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/10 text-white font-semibold border border-white/10">{sub.tier.name}</span>
                        </div>
                        <p className="text-xs text-zinc-500">
                            {lamportsToSol(sub.tier.priceMonthly)} SOL/{sub.billingCycle === "annual" ? "yr" : "mo"}
                            {sub.cancelAtPeriodEnd
                                ? ` · Cancels ${formatDistanceToNow(new Date(sub.currentPeriodEnd))} from now`
                                : ` · Renews ${formatDistanceToNow(new Date(sub.currentPeriodEnd))} from now`
                            }
                        </p>
                    </div>
                    {!sub.cancelAtPeriodEnd && (
                        <button
                            onClick={() => cancel.mutate({ creatorId: sub.creator.id })}
                            disabled={cancel.isPending}
                            className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                            title="Cancel subscription"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
