"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { shortenWalletAddress } from "@/lib/utils";

interface NFTRecipientTriggerProps {
    recipient: string;
    recipientDisplay: string;
    recipientMeta?: { username?: string; name?: string; avatar_url?: string };
    onClick: () => void;
}

export function NFTRecipientTrigger({ recipient, recipientDisplay, recipientMeta, onClick }: NFTRecipientTriggerProps) {
    return (
        <button
            onClick={onClick}
            className="cursor-pointer w-full rounded-3xl border border-baseborder/20 bg-panel2 px-4 py-3.5 flex items-center gap-3 transition-colors hover:bg-white/[0.05] text-left"
        >
            {recipient ? (
                recipientMeta?.avatar_url ? (
                    <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarImage src={recipientMeta.avatar_url} />
                        <AvatarFallback className="bg-white/[0.08] text-[10px]">
                            
                        </AvatarFallback>
                    </Avatar>
                ) : (
                    <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-zinc-400">◎</span>
                    </div>
                )
            ) : null}
            <div className="flex-1 min-w-0">
                {recipient ? (
                    <p className="text-14 font-medium text-white truncate">{recipientDisplay}</p>
                ) : (
                    <p className="text-14 font-medium text-zinc-600">Recipient's Solana address</p>
                )}
                {recipient && (
                    <p className="text-11 text-zinc-500 leading-tight">{shortenWalletAddress(recipient)}</p>
                )}
            </div>
            <HugeiconsIcon icon={ArrowDown01Icon} className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        </button>
    );
}
