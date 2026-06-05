"use client";

import { NFT } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { shortenWalletAddress } from "@/lib/utils";

interface NFTPreviewCardProps {
    nft: NFT;
    recipientAddress: string;
    recipientDisplay: string;
}

export function NFTPreviewCard({ nft, recipientAddress, recipientDisplay }: NFTPreviewCardProps) {
    return (
        <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative aspect-square w-32 rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.5)] border border-white/5">
                <TokenIcon
                    src={nft.image}
                    symbol={nft.name}
                    className="w-full h-full rounded-2xl object-cover"
                    type="nft"
                />
            </div>
            <div>
                <h3 className="text-[28px] font-bold text-white leading-tight mb-1">
                    {nft.name}
                </h3>
                <p className="text-[14px] text-zinc-500 font-medium">
                    to {recipientDisplay} ({shortenWalletAddress(recipientAddress)})
                </p>
            </div>
        </div>
    );
}
