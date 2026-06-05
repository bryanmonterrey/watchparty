"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Crown, Check, ChevronDown, Gift } from "lucide-react";
import { toast } from "sonner";
import { useAuthSession } from "@/hooks/use-auth-session";
import { cn } from "@/lib/utils";

const SOL = 1_000_000_000;
function lamportsToSol(l: number) {
    return (l / SOL).toFixed(3).replace(/\.?0+$/, "");
}

interface SubscribeButtonProps {
    creatorId: string;
    creatorName: string;
}

export function SubscribeButton({ creatorId, creatorName }: SubscribeButtonProps) {
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();

    const { data: tiers } = trpc.subscription.getTiers.useQuery({ creatorId });
    const { data: subStatus, isLoading: subLoading } = trpc.subscription.isSubscribed.useQuery(
        { creatorId },
        { enabled: !!session?.user }
    );

    const subscribe = trpc.subscription.subscribe.useMutation({
        onSuccess: () => {
            utils.subscription.isSubscribed.invalidate({ creatorId });
            setShowPicker(false);
            toast.success(`Subscribed to ${creatorName}!`);
        },
        onError: (e) => toast.error(e.message),
    });
    const cancel = trpc.subscription.cancelSubscription.useMutation({
        onSuccess: () => {
            utils.subscription.isSubscribed.invalidate({ creatorId });
            toast.success("Subscription cancelled");
        },
    });

    const [showPicker, setShowPicker] = useState(false);
    const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

    if (!tiers?.length) return null;
    if (!session?.user) return null;

    if (subStatus?.subscribed) {
        return (
            <div className="relative">
                <button
                    onClick={() => setShowPicker(p => !p)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-lantern/10 border border-lantern/30 text-lantern text-sm font-semibold hover:bg-lantern/20 transition-colors"
                >
                    <Crown className="w-4 h-4" />
                    {subStatus.tier?.name ?? "Subscribed"}
                    <ChevronDown className="w-3 h-3" />
                </button>
                {showPicker && (
                    <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-20 w-52 py-1 overflow-hidden"
                        onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => cancel.mutate({ creatorId })}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition-colors text-left"
                        >
                            Cancel subscription
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={() => setShowPicker(p => !p)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-lantern text-zinc-950 text-sm font-bold hover:bg-lantern/90 transition-colors"
            >
                <Crown className="w-4 h-4" />
                Subscribe
            </button>
            {showPicker && (
                <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-20 w-64 overflow-hidden"
                    onClick={e => e.stopPropagation()}>
                    <div className="p-3 border-b border-white/10">
                        <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs font-semibold">
                            <button onClick={() => setBillingCycle("monthly")}
                                className={cn("flex-1 py-1.5 transition-colors", billingCycle === "monthly" ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
                                Monthly
                            </button>
                            <button onClick={() => setBillingCycle("annual")}
                                className={cn("flex-1 py-1.5 transition-colors", billingCycle === "annual" ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
                                Annual
                            </button>
                        </div>
                    </div>
                    <div className="p-2 space-y-1">
                        {tiers.map(tier => {
                            const price = billingCycle === "annual" && tier.priceAnnual ? tier.priceAnnual : tier.priceMonthly;
                            return (
                                <button
                                    key={tier.id}
                                    onClick={() => subscribe.mutate({ tierId: tier.id, billingCycle })}
                                    disabled={subscribe.isPending}
                                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left disabled:opacity-50"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-zinc-100">{tier.name}</p>
                                        {tier.description && <p className="text-xs text-zinc-500 truncate max-w-[140px]">{tier.description}</p>}
                                    </div>
                                    <span className="text-xs font-bold text-lantern shrink-0 ml-2">
                                        {lamportsToSol(price)} SOL
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
