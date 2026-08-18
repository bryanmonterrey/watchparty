"use client";

import { DrawerHeader } from "../../components/drawer-chrome";
import * as React from "react";
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
        <div className="flex h-full flex-col overflow-hidden bg-canvas">
            <DrawerHeader
                title="Confirm send"
                onBack={onBack}
                className="sticky top-0 z-10 bg-canvas/80 backdrop-blur-md"
            />

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
                    className="flex-1 h-14 rounded-full bg-white/[0.05] text-15 font-bold text-white hover:bg-white/[0.10] transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    onClick={onSend}
                    disabled={isSending}
                    className={cn(
                        "flex-1 h-14 rounded-full text-15 font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer",
                        "bg-white/90 text-black hover:bg-white"
                    )}
                >
                    {isSending ? "Sending..." : "Send"}
                </button>
            </div>
        </div>
    );
}
