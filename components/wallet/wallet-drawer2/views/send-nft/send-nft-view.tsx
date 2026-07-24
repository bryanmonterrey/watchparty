"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { NFT } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { cn } from "@/lib/utils";
import { RecentRecipient } from "../send/send-recipient";
import { SendRecipientSelector } from "../send/send-recipient-selector";
import { NFTRecipientTrigger } from "./nft-recipient-trigger";

const RECENTS_KEY = "send_recents_v1";

function loadRecents(): RecentRecipient[] {
    try {
        const raw = localStorage.getItem(RECENTS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

interface SendNFTViewProps {
    nft: NFT;
    onBack: () => void;
    onNext: (address: string, display: string, meta?: { username?: string; name?: string; avatar_url?: string }) => void;
}

export function SendNFTView({ nft, onBack, onNext }: SendNFTViewProps) {
    const [recipient, setRecipient] = React.useState("");
    const [recipientDisplay, setRecipientDisplay] = React.useState("");
    const [recipientMeta, setRecipientMeta] = React.useState<{ username?: string; name?: string; avatar_url?: string } | undefined>();
    const [recents, setRecents] = React.useState<RecentRecipient[]>([]);
    const [selectorOpen, setSelectorOpen] = React.useState(false);

    React.useEffect(() => {
        setRecents(loadRecents());
    }, []);

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
                    {nft.name}
                </h2>
            </div>

            <div className="flex-1 px-6 flex flex-col items-center">
                <div className="w-full max-w-[320px] pt-4 space-y-8 flex flex-col items-center">
                    {/* Image */}
                    <div className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                        <TokenIcon
                            src={nft.image}
                            symbol={nft.name}
                            className="w-full h-full rounded-2xl object-cover"
                            type="nft"
                        />
                    </div>

                    <NFTRecipientTrigger
                        recipient={recipient}
                        recipientDisplay={recipientDisplay}
                        recipientMeta={recipientMeta}
                        onClick={() => setSelectorOpen(true)}
                    />

                    <SendRecipientSelector
                        open={selectorOpen}
                        onClose={() => setSelectorOpen(false)}
                        onSelect={({ address, display, username, name, avatar_url }) => {
                            setRecipient(address);
                            setRecipientDisplay(display);
                            setRecipientMeta({ username, name, avatar_url });
                        }}
                        recents={recents}
                    />
                </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-6 pb-8 flex gap-3 z-10">
                <button
                    onClick={onBack}
                    className="flex-1 h-14 rounded-2xl bg-zinc-900/80 text-[17px] font-bold text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    onClick={() => onNext(recipient, recipientDisplay, recipientMeta)}
                    disabled={!recipient}
                    className={cn(
                        "flex-1 h-14 rounded-2xl text-[17px] font-bold transition-all cursor-pointer",
                        recipient
                            ? "bg-zinc-900 text-white hover:bg-zinc-800"
                            : "bg-zinc-900/40 text-zinc-600 cursor-not-allowed"
                    )}
                >
                    Next
                </button>
            </div>
        </div>
    );
}
