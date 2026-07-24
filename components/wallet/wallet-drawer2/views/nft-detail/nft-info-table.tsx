"use client";

import { cn } from "@/lib/utils";
import { NFT } from "../../types";

interface NFTInfoTableProps {
    nft: NFT;
}

export function NFTInfoTable({ nft }: NFTInfoTableProps) {
    const isNegative = nft.totalReturn && nft.totalReturn < 0;

    const infoRows = [
        { label: "Collection", value: nft.collectionName || "We Tardio World Order", valueClass: "text-white" },
        { label: "Floor Price", value: nft.floorPrice ? `${nft.floorPrice.toFixed(4)} SOL` : "0.0075 SOL", valueClass: "text-white" },
        { label: "Last Sale Price", value: nft.lastSalePrice ? `${nft.lastSalePrice.toFixed(4)} SOL` : "0.0142 SOL", valueClass: "text-white" },
        {
            label: "Total Return",
            value: nft.totalReturn ? `${nft.totalReturn > 0 ? '+' : ''}${nft.totalReturn.toFixed(4)} SOL` : "-0.0067 SOL",
            valueClass: isNegative || !nft.totalReturn ? "text-red-500" : "text-green-500"
        },
        { label: "Unique Holders", value: nft.uniqueHolders ? nft.uniqueHolders.toLocaleString() : "474", valueClass: "text-white" },
        { label: "Network", value: nft.network || "Solana", valueClass: "text-white" },
    ];

    return (
        <div className="bg-zinc-900 border-zinc-500/5 border hover:bg-zinc-800/70 rounded-2xl overflow-hidden flex flex-col">
            {infoRows.map((row, i) => (
                <div
                    key={row.label}
                    className={cn(
                        "flex items-center justify-between p-4",
                        i !== infoRows.length - 1 && "border-b border-white/5"
                    )}
                >
                    <span className="text-lg font-medium text-zinc-500">{row.label}</span>
                    <span className={cn("text-lg font-bold", row.valueClass)}>{row.value}</span>
                </div>
            ))}
        </div>
    );
}
