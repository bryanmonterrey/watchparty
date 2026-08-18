"use client";

import { NFTCollection } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { DrawerBackButton } from "../../components/drawer-chrome";

interface CollectionHeaderProps {
    collection: NFTCollection;
    onBack: () => void;
}

export function CollectionHeader({ collection, onBack }: CollectionHeaderProps) {
    return (
        <div className="flex h-14 items-center gap-2 px-3">
            <DrawerBackButton onBack={onBack} />
            <div className="flex min-w-0 items-center gap-2.5">
                <TokenIcon
                    src={collection.image}
                    symbol={collection.name}
                    size="sm"
                    type="nft"
                    innerClassName="rounded-none"
                />
                <div className="flex min-w-0 flex-col">
                    <h2 className="truncate text-16 font-bold leading-none tracking-tight text-white">
                        {collection.name}
                    </h2>
                    <p className="mt-1 text-13 font-medium leading-none text-zinc-500">
                        {collection.count} {collection.count === 1 ? "item" : "items"}
                    </p>
                </div>
            </div>
        </div>
    );
}
