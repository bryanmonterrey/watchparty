"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { NFT } from "../../types";
import { cn } from "@/lib/utils";
import { NFTPreviewCard } from "./nft-preview-card";
import { SendDetailsCard } from "./send-details-card";

interface NFTConfirmSendViewProps {
    nft: NFT;
    recipientAddress: string;
    recipientDisplay: string;
    recipientMeta?: { username?: string; name?: string; avatar_url?: string };
    onBack: () => void;
    onSend: () => Promise<void>;
    isSending?: boolean;
}

export function NFTConfirmSendView({
    nft,
    recipientAddress,
    recipientDisplay,
    onBack,
    onSend,
    isSending = false,
}: NFTConfirmSendViewProps) {
    return (
        <div className="flex flex-col h-full bg-[#0A0A0A] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sticky top-0 bg-[#0A0A0A]/80 backdrop-blur-md z-10">
                <button
                    onClick={onBack}
                    className="p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white flex-1 text-center mr-8">
                    Confirm Send
                </h2>
            </div>

            <div className="flex-1 px-6 flex flex-col items-center">
                <div className="w-full max-w-[320px] pt-4 space-y-6 flex flex-col items-center">
                    <NFTPreviewCard
                        nft={nft}
                        recipientAddress={recipientAddress}
                        recipientDisplay={recipientDisplay}
                    />
                    <SendDetailsCard
                        recipientAddress={recipientAddress}
                        recipientDisplay={recipientDisplay}
                    />
                </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-6 pb-8 flex gap-3 z-10">
                <button
                    onClick={onBack}
                    disabled={isSending}
                    className="flex-1 h-14 rounded-full bg-zinc-900 text-[17px] font-bold text-white hover:bg-zinc-800 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    onClick={onSend}
                    disabled={isSending}
                    className={cn(
                        "flex-1 h-14 rounded-full text-[17px] font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer",
                        "bg-white/90 text-[#0A0A0A] hover:bg-white"
                    )}
                >
                    {isSending ? "Sending..." : "Send"}
                </button>
            </div>
        </div>
    );
}
