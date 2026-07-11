"use client";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, Crown } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

export function GiftInbox() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.subscription.getMyGifts.useQuery();
    const redeem = trpc.subscription.redeemGift.useMutation({
        onSuccess: () => {
            utils.subscription.getMyGifts.invalidate();
            utils.subscription.getMySubscriptions.invalidate();
            toast.success("Gift subscription activated!");
        },
        onError: e => toast.error(e.message),
    });

    if (isLoading) return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;

    if (!data?.length) return (
        <div className="text-center py-12 space-y-2">
            <Gift className="w-10 h-10 mx-auto text-zinc-700" />
            <p className="text-sm text-zinc-500">No pending gift subscriptions</p>
        </div>
    );

    return (
        <div className="space-y-3">
            <p className="text-xs text-zinc-500">Redeem your gifted subscriptions before they expire.</p>
            {data.map(gift => (
                <div key={gift.id} className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <Gift className="w-5 h-5 text-white shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-zinc-100">
                                {gift.durationMonths}mo <span className="text-white">{gift.tier.name}</span> subscription
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                From{" "}
                                <Link href={`/${gift.sender.username}`} className="text-zinc-300 hover:underline">
                                    {gift.sender.name}
                                </Link>
                                {" · "}Expires {formatDistanceToNow(new Date(gift.expiresAt))} from now
                            </p>
                            {gift.message && (
                                <p className="text-xs text-zinc-400 italic mt-1.5">"{gift.message}"</p>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <Crown className="w-3.5 h-3.5 text-white" />
                        </div>
                    </div>
                    <button
                        onClick={() => redeem.mutate({ giftId: gift.id })}
                        disabled={redeem.isPending}
                        className="w-full py-2 rounded-xl bg-white text-zinc-950 text-sm font-bold hover:bg-white/90 transition-colors disabled:opacity-50"
                    >
                        {redeem.isPending ? "Activating…" : "Redeem Gift"}
                    </button>
                </div>
            ))}
        </div>
    );
}
