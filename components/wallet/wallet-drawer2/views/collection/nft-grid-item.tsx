"use client";

import { NFT } from "../../types";
import { TokenIcon } from "../../components/token-icon";

interface NFTGridItemProps {
    nft: NFT;
    onClick: (nft: NFT) => void;
}

export function NFTGridItem({ nft, onClick }: NFTGridItemProps) {
    return (
        <div
            className="group relative aspect-square cursor-pointer overflow-hidden rounded-3xl bg-white/[0.04] transition-colors hover:bg-white/[0.08]"
            onClick={() => onClick(nft)}
        >
            <TokenIcon
                src={nft.image}
                symbol={nft.name}
                className="size-full object-cover"
                innerClassName="rounded-none"
                type="nft"
            />
            <div className="absolute inset-x-2 bottom-2 translate-y-1 rounded-2xl bg-black/70 p-2 opacity-0 backdrop-blur-md transition-all group-hover:translate-y-0 group-hover:opacity-100">
                <p className="text-12 font-bold text-white line-clamp-1 text-center">
                    {nft.name}
                </p>
            </div>
        </div>
    );
}
