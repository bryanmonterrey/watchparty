import { TokenIcon } from "./token-icon";
import { NFTCollection } from "../types";
import { Pin } from "lucide-react";

interface CollectionItemProps {
    collection: NFTCollection;
    onClick: (collection: NFTCollection) => void;
}

export function CollectionItem({ collection, onClick }: CollectionItemProps) {
    const hasPinned = collection.items.some(nft => nft.isPinned);

    return (
        <div
            className="group relative aspect-square overflow-hidden rounded-xl transition-all cursor-pointer bg-zinc-900/40"
            onClick={() => onClick(collection)}
        >
            <TokenIcon
                src={collection.image}
                symbol={collection.name}
                className="w-full h-full object-cover"
                innerClassName="rounded-lg"
                type="nft"
            />
            
            {/* Overlay Info */}
            <div className="absolute inset-x-2 bottom-2 p-2 bg-black/90 backdrop-blur-md rounded-md border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                    {hasPinned && <Pin className="w-2.5 h-2.5 text-white/60 shrink-0" />}
                    <p className="text-[13px] font-bold text-white line-clamp-1 tracking-tight">
                        {collection.name}
                    </p>
                </div>
                <span className="text-[13px] font-bold text-white/50 shrink-0 ml-1">
                    {collection.count}
                </span>
            </div>
        </div>
    );
}
