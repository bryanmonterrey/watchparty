"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { NFT } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { NFTActions } from "./nft-actions";
import { NFTInfoTable } from "./nft-info-table";
import { NFTProperties } from "./nft-properties";
import { MoreActionsOverlay } from "./more-actions-overlay";

interface NFTDetailViewProps {
    nft: NFT;
    onBack: () => void;
    onSend: (nft: NFT) => void;
    onPin?: (nft: NFT) => void;
    onAvatar?: (nft: NFT) => void;
    onMore?: (nft: NFT) => void;
    onHideCollections?: () => void;
    onReportSpam?: (nft: NFT) => void;
}

export function NFTDetailView({ nft, onBack, onSend, onPin, onAvatar, onMore, onHideCollections, onReportSpam }: NFTDetailViewProps) {
    const [showMoreActions, setShowMoreActions] = useState(false);

    return (
        <div className="flex flex-col h-full bg-[#0A0A0A] rounded-2xl overflow-y-auto hidden-scrollbar">
            {/* Header */}
            <div className="flex items-center justify-between p-4 rounded-t-2xl sticky top-0 bg-[#0A0A0A]/80 backdrop-blur-md z-10">
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

            <div className="px-4 pb-10 space-y-6">
                {/* Image */}
                <div className="relative aspect-square w-full rounded-none overflow-hidden shadow-2xl">
                    <TokenIcon
                        src={nft.image}
                        symbol={nft.name}
                        className="w-full h-full rounded-none object-cover"
                        type="nft"
                    />
                </div>

                {/* Action Buttons */}
                <NFTActions
                    nft={nft}
                    onSend={onSend}
                    onPin={onPin}
                    onAvatar={onAvatar}
                    onMore={() => {
                        onMore?.(nft);
                        setShowMoreActions(true);
                    }}
                />

                {/* Description */}
                <div className="bg-zinc-900 border-zinc-500/5 border hover:bg-zinc-800/70 rounded-2xl p-4 space-y-1">
                    <p className="text-md font-bold text-zinc-500">Description</p>
                    <p className="text-md font-semibold text-white/90">
                        {nft.description || "2222 We Tardio World Order"}
                    </p>
                </div>

                {/* Info Table */}
                <NFTInfoTable nft={nft} />

                {/* Properties */}
                <NFTProperties nft={nft} />
            </div>

            {/* More Actions Overlay */}
            <AnimatePresence>
                {showMoreActions && (
                    <MoreActionsOverlay
                        nft={nft}
                        onClose={() => setShowMoreActions(false)}
                        onHideCollections={onHideCollections}
                        onReportSpam={onReportSpam}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

export default NFTDetailView;
