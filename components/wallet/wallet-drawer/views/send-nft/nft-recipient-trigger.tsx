"use client";

import { ChevronDown } from "lucide-react";
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
            className="cursor-pointer w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 flex items-center gap-3 hover:border-zinc-700/50 transition-colors text-left"
        >
            {recipient ? (
                recipientMeta?.avatar_url ? (
                    <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarImage src={recipientMeta.avatar_url} />
                        <AvatarFallback className="bg-zinc-700 text-[10px]">
                            
                        </AvatarFallback>
                    </Avatar>
                ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-zinc-400">◎</span>
                    </div>
                )
            ) : null}
            <div className="flex-1 min-w-0">
                {recipient ? (
                    <p className="text-[15px] font-medium text-white truncate">{recipientDisplay}</p>
                ) : (
                    <p className="text-[15px] font-medium text-zinc-600">Recipient's Solana address</p>
                )}
                {recipient && (
                    <p className="text-[12px] text-zinc-500 leading-tight">{shortenWalletAddress(recipient)}</p>
                )}
            </div>
            <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        </button>
    );
}
