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
            className="group relative aspect-square overflow-hidden rounded-2xl border-2 border-white/5 hover:border-white/10 transition-all cursor-pointer bg-zinc-900/40"
            onClick={() => onClick(nft)}
        >
            <TokenIcon
                src={nft.image}
                symbol={nft.name}
                className="w-full h-full object-cover"
                innerClassName="rounded-xl"
                type="nft"
            />
            <div className="absolute inset-x-2 bottom-2 p-2 bg-black/90 backdrop-blur-md rounded-md border border-white/5 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0">
                <p className="text-[12px] font-bold text-white line-clamp-1 text-center">
                    {nft.name}
                </p>
            </div>
        </div>
    );
}
