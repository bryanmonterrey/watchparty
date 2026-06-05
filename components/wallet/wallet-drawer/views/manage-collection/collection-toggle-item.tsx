"use client";

import { motion } from "motion/react";
import { NFTCollection } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { cn } from "@/lib/utils";

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
            className="bg-[#1C1C1E] rounded-[22px] p-4 flex items-center justify-between border border-white/5 group hover:bg-zinc-800/50 transition-colors"
        >
            <div className="flex items-center gap-4">
                <TokenIcon
                    src={collection.image}
                    symbol={collection.name}
                    className="w-[60px] h-[60px] rounded-[14px] shadow-lg"
                    innerClassName="rounded-[14px]"
                    type="nft"
                />
                <div className="flex flex-col gap-0.5">
                    <h3 className="text-lg font-bold text-white tracking-tight leading-tight">
                        {collection.name}
                    </h3>
                    <p className="text-[15px] font-medium text-zinc-500">
                        {collection.count} Items
                    </p>
                </div>
            </div>

            <button
                onClick={() => onToggle(collection.id)}
                className={cn(
                    "relative w-[52px] h-[32px] rounded-full transition-colors duration-200 outline-none flex items-center px-1",
                    shown ? "bg-lantern" : "bg-zinc-700"
                )}
            >
                <motion.div
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="w-6 h-6 bg-white rounded-full shadow-md"
                    animate={{ x: shown ? 20 : 0 }}
                />
            </button>
        </motion.div>
    );
}
