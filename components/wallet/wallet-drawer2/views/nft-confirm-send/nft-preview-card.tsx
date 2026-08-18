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
            <div className="relative aspect-square w-32 overflow-hidden rounded-3xl">
                <TokenIcon
                    src={nft.image}
                    symbol={nft.name}
                    className="size-full rounded-none object-cover"
                    type="nft"
                />
            </div>
            <div>
                <h3 className="mb-1 text-[28px] font-bold leading-tight tracking-tight text-white">
                    {nft.name}
                </h3>
                <p className="text-12 font-medium text-zinc-500">
                    to {recipientDisplay} ({shortenWalletAddress(recipientAddress)})
                </p>
            </div>
        </div>
    );
}
