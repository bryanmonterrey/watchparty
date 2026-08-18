"use client";

import { DrawerHeader } from "../../components/drawer-chrome";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
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
        <div className="flex h-full flex-col overflow-y-auto hidden-scrollbar bg-canvas">
            <DrawerHeader
                title={nft.name}
                onBack={onBack}
                className="sticky top-0 z-10 bg-canvas/80 backdrop-blur-md"
            />

            <div className="px-4 pb-10 space-y-6">
                {/* Image */}
                <div className="relative aspect-square w-full overflow-hidden rounded-3xl">
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

                {/* Description. Rendered only when there IS one — the fallback
                    was a hardcoded string from somebody's test collection, so
                    every NFT without a description showed another NFT's copy. */}
                {nft.description && (
                    <div className="space-y-1 rounded-3xl border border-baseborder/20 bg-panel2 p-4">
                        <p className="text-13 font-medium text-zinc-500">Description</p>
                        <p className="text-14 font-medium leading-relaxed text-white">
                            {nft.description}
                        </p>
                    </div>
                )}

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
