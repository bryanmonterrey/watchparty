"use client";

import { DrawerHeader } from "../../components/drawer-chrome";
import * as React from "react";
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
        <div className="flex h-full flex-col overflow-hidden bg-canvas">
            <DrawerHeader
                title={nft.name}
                onBack={onBack}
                className="sticky top-0 z-10 bg-canvas/80 backdrop-blur-md"
            />

            <div className="flex-1 px-6 flex flex-col items-center">
                <div className="w-full max-w-[320px] pt-4 space-y-8 flex flex-col items-center">
                    {/* Image */}
                    <div className="relative aspect-square w-full overflow-hidden rounded-3xl">
                        <TokenIcon
                            src={nft.image}
                            symbol={nft.name}
                            className="size-full rounded-none object-cover"
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
                    className="h-12 flex-1 cursor-pointer rounded-full bg-white/[0.08] text-13 font-bold text-white transition-colors hover:bg-white/[0.14] active:scale-[0.99]"
                >
                    Cancel
                </button>
                <button
                    onClick={() => onNext(recipient, recipientDisplay, recipientMeta)}
                    disabled={!recipient}
                    className={cn(
                        "h-12 flex-1 cursor-pointer rounded-full text-13 font-bold transition-colors active:scale-[0.99]",
                        recipient
                            ? "bg-white/[0.08] text-white hover:bg-white/[0.14]"
                            : "bg-white/[0.04] text-zinc-600 cursor-not-allowed"
                    )}
                >
                    Next
                </button>
            </div>
        </div>
    );
}
