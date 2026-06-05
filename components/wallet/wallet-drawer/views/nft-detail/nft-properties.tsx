"use client";

import { NFT } from "../../types";

interface NFTPropertiesProps {
    nft: NFT;
}

const FALLBACK_PROPS = [
    "BACKGROUND Acrobatics",
    "BODY Mime",
    "CLOTHES Hip",
    "MOUTH Serious",
    "EYES empty",
    "HAT bandana",
    "HAIR Dreadlocks blue",
];

export function NFTProperties({ nft }: NFTPropertiesProps) {
    return (
        <div className="space-y-3">
            <p className="text-lg font-bold text-zinc-500 px-1">Properties</p>
            <div className="flex flex-wrap gap-2">
                {nft.attributes ? (
                    nft.attributes.map((attr, i) => (
                        <div key={i} className="bg-transparent border border-white/10 rounded-xl px-3 py-2 flex flex-col gap-0.5">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{attr.trait_type}</p>
                            <p className="text-[13px] font-bold text-white tracking-tight">{String(attr.value)}</p>
                        </div>
                    ))
                ) : (
                    FALLBACK_PROPS.map((prop, i) => {
                        const [type, ...valParts] = prop.split(' ');
                        return (
                            <div key={i} className="bg-transparent border border-white/10 rounded-xl px-3 py-2 flex flex-col gap-0.5 min-w-[80px]">
                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{type}</p>
                                <p className="text-[13px] font-bold text-white tracking-tight">{valParts.join(' ')}</p>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
