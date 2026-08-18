"use client";

import {
    Send2Icon,
    Pin2Icon,
    UnpinIcon,
    EmojiIcon,
    RestingDotsIcon,
} from "@/components/icons";
import { NFT } from "../../types";
import { DRAWER_CARD_INTERACTIVE } from "../../components/drawer-chrome";
import { cn } from "@/lib/utils";

interface NFTActionsProps {
    nft: NFT;
    onSend: (nft: NFT) => void;
    onPin?: (nft: NFT) => void;
    onAvatar?: (nft: NFT) => void;
    onMore: () => void;
}

// Same four-tile block as the coin screen's TokenActions, on the same card —
// these were zinc-900 tiles with a black/15 disc behind each glyph, a second
// elevation language inside one drawer.
export function NFTActions({ nft, onSend, onPin, onAvatar, onMore }: NFTActionsProps) {
    const tile = cn(DRAWER_CARD_INTERACTIVE, "flex flex-col items-center gap-2 px-2 py-3.5 active:scale-95");
    const iconClass = "size-5 text-white";
    const labelClass = "text-12 font-semibold text-zinc-400";

    return (
        <div className="grid grid-cols-4 gap-1">
            <button onClick={() => onSend(nft)} className={tile}>
                <Send2Icon className={iconClass} />
                <span className={labelClass}>Send</span>
            </button>
            <button onClick={() => onPin?.(nft)} className={tile}>
                {nft.isPinned ? <UnpinIcon className={iconClass} /> : <Pin2Icon className={iconClass} />}
                <span className={labelClass}>{nft.isPinned ? "Unpin" : "Pin"}</span>
            </button>
            <button onClick={() => onAvatar?.(nft)} className={tile}>
                <EmojiIcon className={iconClass} />
                <span className={labelClass}>Avatar</span>
            </button>
            <button onClick={onMore} className={tile}>
                <RestingDotsIcon className={iconClass} />
                <span className={labelClass}>More</span>
            </button>
        </div>
    );
}
