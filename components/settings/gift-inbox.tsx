"use client";

import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import { GiftIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { EmptyState, Panel, PanelSkeleton, PillButton } from "@/components/settings/ui";

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

    if (isLoading) return <PanelSkeleton rows={2} rowClassName="h-20" />;

    if (!data?.length) return (
        <EmptyState title="No pending gifts" hint="Gifted subscriptions land here until you redeem them" />
    );

    return (
        <div className="space-y-3">
            <p className="text-[12px] font-medium text-zinc-500">Redeem your gifted subscriptions before they expire.</p>
            {data.map(gift => (
                <Panel key={gift.id} className="space-y-3 p-5">
                    <div className="flex items-start gap-3">
                        <HugeiconsIcon icon={GiftIcon} className="mt-0.5 size-5 shrink-0 text-white" strokeWidth={2} />
                        <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-bold text-white">
                                {gift.durationMonths}mo {gift.tier.name} subscription
                            </p>
                            <p className="mt-0.5 text-[12px] font-medium text-zinc-500">
                                From{" "}
                                <Link href={`/${gift.sender.username}`} className="text-zinc-300 hover:underline">
                                    {gift.sender.name}
                                </Link>
                                {" · "}Expires {formatDistanceToNow(new Date(gift.expiresAt))} from now
                            </p>
                            {gift.message && (
                                <p className="mt-1.5 text-[12px] italic text-zinc-400">"{gift.message}"</p>
                            )}
                        </div>
                    </div>
                    <PillButton
                        variant="primary"
                        className="w-full"
                        onClick={() => redeem.mutate({ giftId: gift.id })}
                        disabled={redeem.isPending}
                    >
                        {redeem.isPending ? "Activating…" : "Redeem gift"}
                    </PillButton>
                </Panel>
            ))}
        </div>
    );
}
