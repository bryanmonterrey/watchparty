"use client";

import {
    Send2Icon,
    Pin2Icon,
    UnpinIcon,
    EmojiIcon,
    RestingDotsIcon,
} from "@/components/icons";
import { NFT } from "../../types";

interface NFTActionsProps {
    nft: NFT;
    onSend: (nft: NFT) => void;
    onPin?: (nft: NFT) => void;
    onAvatar?: (nft: NFT) => void;
    onMore: () => void;
}

export function NFTActions({ nft, onSend, onPin, onAvatar, onMore }: NFTActionsProps) {
    return (
        <div className="grid grid-cols-4 gap-1">
            <button
                onClick={() => onSend(nft)}
                className="cursor-pointer ease-in-out flex duration-150 flex-col items-center gap-1.5 p-3 rounded-2xl bg-zinc-900 border-zinc-500/5 border hover:bg-zinc-800/70 transition-all group"
            >
                <div className="w-10 h-10 rounded-full bg-black/15 group-hover:bg-zinc-700/60 flex items-center justify-center transition-colors">
                    <Send2Icon className="w-5 h-5 text-white/80" />
                </div>
                <span className="text-xs font-medium text-zinc-300">Send</span>
            </button>
            <button
                onClick={() => onPin?.(nft)}
                className="cursor-pointer ease-in-out flex duration-150 flex-col items-center gap-1.5 p-3 rounded-2xl bg-zinc-900 border-zinc-500/5 border hover:bg-zinc-800/70 transition-all group"
            >
                <div className="w-10 h-10 rounded-full bg-black/15 group-hover:bg-zinc-700/60 flex items-center justify-center transition-colors">
                    {nft.isPinned ? (
                        <UnpinIcon className="w-5 h-5 text-white transition-opacity" />
                    ) : (
                        <Pin2Icon className="w-5 h-5 text-white/80 transition-opacity" />
                    )}
                </div>
                <span className="text-xs font-medium text-zinc-300">
                    {nft.isPinned ? "Unpin" : "Pin"}
                </span>
            </button>
            <button
                onClick={() => onAvatar?.(nft)}
                className="cursor-pointer ease-in-out flex duration-150 flex-col items-center gap-1.5 p-3 rounded-2xl bg-zinc-900 border-zinc-500/5 border hover:bg-zinc-800/70 transition-all group"
            >
                <div className="w-10 h-10 rounded-full bg-black/15 group-hover:bg-zinc-700/60 flex items-center justify-center transition-colors">
                    <EmojiIcon className="w-5 h-5 text-white/80" />
                </div>
                <span className="text-xs font-medium text-zinc-300">Avatar</span>
            </button>
            <button
                onClick={onMore}
                className="cursor-pointer ease-in-out flex duration-150 flex-col items-center gap-1.5 p-3 rounded-2xl bg-zinc-900 border-zinc-500/5 border hover:bg-zinc-800/70 transition-all group"
            >
                <div className="w-10 h-10 rounded-full bg-black/15 group-hover:bg-zinc-700/60 flex items-center justify-center transition-colors">
                    <RestingDotsIcon className="w-5 h-5 text-white/80" />
                </div>
                <span className="text-xs font-medium text-zinc-300">More</span>
            </button>
        </div>
    );
}
