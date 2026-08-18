"use client";

import { NFT, NFTCollection } from "../../types";
import { CollectionHeader } from "./collection-header";
import { NFTGridItem } from "./nft-grid-item";

interface CollectionViewProps {
    collection: NFTCollection;
    onBack: () => void;
    onNFTClick: (nft: NFT) => void;
}

export function CollectionView({ collection, onBack, onNFTClick }: CollectionViewProps) {
    return (
        <div className="flex flex-col h-full bg-canvas">
            <CollectionHeader collection={collection} onBack={onBack} />

            <div className="flex-1 overflow-y-auto hidden-scrollbar p-5 pt-1">
                <div className="grid grid-cols-2 gap-2 pb-8">
                    {collection.items.map((nft) => (
                        <NFTGridItem key={nft.mint} nft={nft} onClick={onNFTClick} />
                    ))}
                </div>
            </div>
        </div>
    );
}
