"use client";

import { useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { GiftBoxIcon } from "@/components/icons";
import { GiftPremiumDialog } from "./gift-premium-dialog";

interface GiftPremiumButtonProps {
    recipientId: string;
    recipientName: string;
}

/** Self-gating like SubscribeButton/GiftSubsButton: hidden when signed out or on your own profile. */
export function GiftPremiumButton({ recipientId, recipientName }: GiftPremiumButtonProps) {
    const { data: session } = useAuthSession();
    const [open, setOpen] = useState(false);

    if (!session?.user || session.user.id === recipientId) return null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title="Gift Premium"
                className="flex size-11 items-center justify-center rounded-full border border-flexborder/50 bg-black/25 text-white2 transition-colors hover:bg-white2/10"
            >
                <GiftBoxIcon className="size-5" />
            </button>
            <GiftPremiumDialog recipientId={recipientId} recipientName={recipientName} open={open} onOpenChange={setOpen} />
        </>
    );
}
