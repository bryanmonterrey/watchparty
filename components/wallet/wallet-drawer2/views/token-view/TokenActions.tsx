"use client";

import * as React from "react";
import { SendPaperIcon, ReceiveQrIcon, SwapArrowsIcon, BuyCartIcon, LinkSquareIcon } from "@/components/icons";
import { DRAWER_CARD_INTERACTIVE } from "../../components/drawer-chrome";
import { cn } from "@/lib/utils";

const SOL_MINT = "So11111111111111111111111111111111111111111";

interface TokenActionsProps {
    mint: string;
    onSend: () => void;
    onReceive: () => void;
    onSwap: () => void;
    onBuy: () => void;
}

// Four tiles on the drawer's card — same panel2 fill, hairline and 24px radius
// as the coin rows above them. They were bg-gray1 on a 12px radius with a
// zinc-700/30 disc behind each glyph, which is the language the main view's
// Deposit / Send / Swap block already moved off.
export function TokenActions({ mint, onSend, onReceive, onSwap, onBuy }: TokenActionsProps) {
    const isSol = mint === SOL_MINT;
    const tile = cn(
        DRAWER_CARD_INTERACTIVE,
        "flex flex-col items-center gap-2 px-2 py-3.5 active:scale-95",
    );
    const iconClass = "size-5 text-white";
    const labelClass = "text-11 font-semibold text-zinc-400";

    return (
        <div className="grid grid-cols-4 gap-1">
            <button onClick={onReceive} className={tile}>
                <ReceiveQrIcon className={iconClass} />
                <span className={labelClass}>Receive</span>
            </button>

            <button onClick={onSend} className={tile}>
                <SendPaperIcon className={iconClass} />
                <span className={labelClass}>Send</span>
            </button>

            <button onClick={onSwap} className={tile}>
                <SwapArrowsIcon className={iconClass} />
                <span className={labelClass}>Swap</span>
            </button>

            {isSol ? (
                <button onClick={onBuy} className={tile}>
                    <BuyCartIcon className={iconClass} />
                    <span className={labelClass}>Buy</span>
                </button>
            ) : (
                <a
                    href={`https://solscan.io/token/${mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={tile}
                >
                    <LinkSquareIcon className={iconClass} />
                    <span className={labelClass}>Solscan</span>
                </a>
            )}
        </div>
    );
}
