"use client";

import { NFT } from "../../types";

interface NFTPropertiesProps {
    nft: NFT;
}

// The fallback trait list (BACKGROUND Acrobatics, BODY Mime, …) is gone: it was
// one specific collection's traits, printed on every NFT that shipped without
// attributes. Nothing to show means the section doesn't render.
export function NFTProperties({ nft }: NFTPropertiesProps) {
    const attributes = nft.attributes ?? [];
    if (attributes.length === 0) return null;

    return (
        <section className="space-y-2">
            <p className="px-1.5 text-13 font-semibold text-zinc-500">Properties</p>
            <div className="flex flex-wrap gap-1">
                {attributes.map((attr, i) => (
                    <div
                        key={i}
                        className="flex flex-col gap-0.5 rounded-3xl border border-baseborder/20 bg-panel2 px-3.5 py-2.5"
                    >
                        <p className="text-11 font-medium text-zinc-500">{attr.trait_type}</p>
                        <p className="text-13 font-bold tracking-tight text-white">{String(attr.value)}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}
