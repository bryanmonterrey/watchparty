import { TokenIcon } from "./token-icon";
import { NFTCollection } from "../types";
import { Pin2Icon } from "@/components/icons";

interface CollectionItemProps {
    collection: NFTCollection;
    onClick: (collection: NFTCollection) => void;
}

export function CollectionItem({ collection, onClick }: CollectionItemProps) {
    const hasPinned = collection.items.some(nft => nft.isPinned);

    return (
        // 24px radius, the drawer's one card radius — the tile was rounded-xl,
        // the only 12px corner on the surface.
        <div
            className="group relative aspect-square cursor-pointer overflow-hidden rounded-3xl bg-white/[0.03] transition-colors hover:bg-white/[0.06]"
            onClick={() => onClick(collection)}
        >
            <TokenIcon
                src={collection.image}
                symbol={collection.name}
                className="h-full w-full object-cover"
                innerClassName="rounded-none"
                type="nft"
            />

            {/* Caption plate. No hairline — it sits on artwork, where a white/5
                border reads as a seam rather than as depth. */}
            <div className="absolute inset-x-2 bottom-2 flex items-center justify-between rounded-2xl bg-black/70 p-2 backdrop-blur-md">
                <div className="flex min-w-0 items-center gap-1.5">
                    {hasPinned && <Pin2Icon className="size-3 shrink-0 text-white/60" />}
                    <p className="line-clamp-1 text-12 font-bold tracking-tight text-white">
                        {collection.name}
                    </p>
                </div>
                <span className="ml-1 shrink-0 text-12 font-bold text-white/50">
                    {collection.count}
                </span>
            </div>
        </div>
    );
}
