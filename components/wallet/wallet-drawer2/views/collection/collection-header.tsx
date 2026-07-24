"use client";

import { ArrowLeft } from "lucide-react";
import { NFTCollection } from "../../types";
import { TokenIcon } from "../../components/token-icon";

interface CollectionHeaderProps {
    collection: NFTCollection;
    onBack: () => void;
}

export function CollectionHeader({ collection, onBack }: CollectionHeaderProps) {
    return (
        <div className="flex items-center gap-3 p-5 pt-2">
            <button
                onClick={onBack}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            >
                <ArrowLeft className="w-5 h-5 text-zinc-400" />
            </button>
            <div className="flex items-center gap-2.5">
                <TokenIcon
                    src={collection.image}
                    symbol={collection.name}
                    size="sm"
                    type="nft"
                    innerClassName="rounded-lg"
                />
                <div className="flex flex-col">
                    <h2 className="text-[17px] font-bold text-white leading-none">{collection.name}</h2>
                    <p className="text-[13px] font-medium text-zinc-500 leading-none mt-1">{collection.count} Items</p>
                </div>
            </div>
        </div>
    );
}
