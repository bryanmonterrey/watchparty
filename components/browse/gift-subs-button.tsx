"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { GiftSubscriptionDialog } from "./gift-subscription-dialog";

interface GiftSubsButtonProps {
    creatorId: string;
    creatorName: string;
    /** Override the default trigger styling (e.g. the profile header's soft-gray buttons). */
    className?: string;
}

/** Self-gating like SubscribeButton: hidden when there's nothing to gift. */
export function GiftSubsButton({ creatorId, creatorName, className }: GiftSubsButtonProps) {
    const { data: session } = useAuthSession();
    const { data: tiers } = trpc.subscription.getTiers.useQuery({ creatorId });
    const [open, setOpen] = useState(false);

    if (!session?.user || session.user.id === creatorId) return null;
    if (!tiers?.some(t => t.priceUsdcMonthly)) return null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title="Gift subs to this creator's followers"
                className={className ?? "flex h-11 items-center gap-1.5 rounded-full border border-flexborder/50 bg-black/25 px-4 text-base font-bold text-white2 transition-colors hover:bg-white2/10"}
            >
                <Gift className="size-4" />
                Gift Subs
            </button>
            <GiftSubscriptionDialog creatorId={creatorId} creatorName={creatorName} open={open} onOpenChange={setOpen} />
        </>
    );
}
