"use client";

import { cn } from "@/lib/utils";
import { NFT } from "../../types";
import { DrawerCard, DrawerDataRow } from "../../components/drawer-chrome";

interface NFTInfoTableProps {
    nft: NFT;
}

// Every value here used to have a FABRICATED fallback — the collection name
// "We Tardio World Order", a 0.0075 SOL floor, 474 holders, a -0.0067 SOL
// return — so an NFT we knew nothing about rendered another collection's
// numbers as if they were its own. Missing data reads as an em dash now, and
// the return row only takes a colour when there is a return to colour.
export function NFTInfoTable({ nft }: NFTInfoTableProps) {
    const returnValue = nft.totalReturn;

    const infoRows = [
        { label: "Collection", value: nft.collectionName || "—", valueClass: "text-white" },
        { label: "Floor price", value: nft.floorPrice != null ? `${nft.floorPrice.toFixed(4)} SOL` : "—", valueClass: "text-white" },
        { label: "Last sale price", value: nft.lastSalePrice != null ? `${nft.lastSalePrice.toFixed(4)} SOL` : "—", valueClass: "text-white" },
        {
            label: "Total return",
            value: returnValue != null ? `${returnValue > 0 ? "+" : ""}${returnValue.toFixed(4)} SOL` : "—",
            valueClass: returnValue == null
                ? "text-white"
                : returnValue < 0 ? "text-pastelred" : returnValue > 0 ? "text-lantern" : "text-white",
        },
        { label: "Unique holders", value: nft.uniqueHolders != null ? nft.uniqueHolders.toLocaleString() : "—", valueClass: "text-white" },
        { label: "Network", value: nft.network || "Solana", valueClass: "text-white" },
    ];

    return (
        <DrawerCard className="py-1.5">
            {infoRows.map((row) => (
                <DrawerDataRow key={row.label} label={row.label}>
                    <span className={cn("tabular-nums", row.valueClass)}>{row.value}</span>
                </DrawerDataRow>
            ))}
        </DrawerCard>
    );
}
