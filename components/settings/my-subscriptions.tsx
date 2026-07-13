"use client";

import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { EmptyState, Panel, PanelSkeleton } from "@/components/settings/ui";

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

    if (isLoading) return <PanelSkeleton rows={3} rowClassName="h-16" />;

    if (!data?.length) return (
        <EmptyState title="No active subscriptions" hint="Creators you subscribe to show up here" />
    );

    return (
        <Panel className="p-1.5">
            {data.map(sub => (
                <div key={sub.id} className="flex items-center gap-3 rounded-[18px] px-3.5 py-3 transition-colors hover:bg-white/[0.04]">
                    <Link href={`/${sub.creator.username}`}>
                        {sub.creator.avatar_url
                            ? <img src={sub.creator.avatar_url} className="size-10 rounded-full object-cover" alt={sub.creator.name} />
                            : <div className="flex size-10 items-center justify-center rounded-full bg-white/10 font-bold text-zinc-400">{sub.creator.name?.[0]}</div>
                        }
                    </Link>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <p className="truncate text-[14px] font-semibold text-zinc-200">{sub.creator.name}</p>
                            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white">{sub.tier.name}</span>
                        </div>
                        <p className="text-[12px] font-medium text-zinc-500">
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
                            className="cursor-pointer rounded-full p-1.5 text-zinc-600 transition-colors hover:bg-pastelred/10 hover:text-pastelred"
                            title="Cancel subscription"
                        >
                            <HugeiconsIcon icon={Cancel01Icon} className="size-4" strokeWidth={2} />
                        </button>
                    )}
                </div>
            ))}
        </Panel>
    );
}
