"use client";

import { motion } from "motion/react";
import { NFTCollection } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { Switch } from "@/components/ui/switch";

interface CollectionToggleItemProps {
    collection: NFTCollection;
    shown: boolean;
    onToggle: (id: string) => void;
}

export function CollectionToggleItem({ collection, shown, onToggle }: CollectionToggleItemProps) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="group flex items-center justify-between rounded-3xl border border-baseborder/20 bg-panel2 p-4 transition-colors hover:bg-white/[0.09]"
        >
            <div className="flex items-center gap-4">
                <TokenIcon
                    src={collection.image}
                    symbol={collection.name}
                    className="size-14 rounded-2xl"
                    innerClassName="rounded-2xl"
                    type="nft"
                />
                <div className="flex flex-col gap-0.5">
                    <h3 className="text-14 font-bold leading-tight tracking-tight text-white">
                        {collection.name}
                    </h3>
                    <p className="text-12 font-medium text-zinc-500">
                        {collection.count} {collection.count === 1 ? "item" : "items"}
                    </p>
                </div>
            </div>

            {/* The app's Switch, not a hand-rolled one. This was a 52x32 pill
                that turned LANTERN when on — the app's positive-value green
                used as an interactive state, which is exactly the colour rule
                the design system reserves. */}
            <Switch checked={shown} onCheckedChange={() => onToggle(collection.id)} />
        </motion.div>
    );
}
