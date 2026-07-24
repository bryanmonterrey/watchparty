"use client";

import * as React from "react";
import { SendPaperIcon, ReceiveQrIcon, SwapArrowsIcon, BuyCartIcon, LinkSquareIcon } from "@/components/icons";

const SOL_MINT = "So11111111111111111111111111111111111111111";

interface TokenActionsProps {
    mint: string;
    onSend: () => void;
    onReceive: () => void;
    onSwap: () => void;
    onBuy: () => void;
}

export function TokenActions({ mint, onSend, onReceive, onSwap, onBuy }: TokenActionsProps) {
    const isSol = mint === SOL_MINT;
    const buttonClass = "cursor-pointer flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gray1 hover:bg-zinc-800/70 transition-all duration-200 ease-in-out active:scale-95";
    const circleClass = "w-10 h-10 rounded-full bg-zinc-700/30 flex items-center justify-center";
    const labelClass = "text-xs font-medium text-zinc-300";

    return (
        <div className="grid grid-cols-4 gap-1">

            <button onClick={onReceive} className={buttonClass}>
                <div className={circleClass}>
                    <ReceiveQrIcon className="w-5 h-5 text-white/80" />
                </div>
                <span className={labelClass}>Receive</span>
            </button>

            <button onClick={onSend} className={buttonClass}>
                <div className={circleClass}>
                    <SendPaperIcon className="w-5 h-5 text-white/80" />
                </div>
                <span className={labelClass}>Send</span>
            </button>

            <button onClick={onSwap} className={buttonClass}>
                <div className={circleClass}>
                    <SwapArrowsIcon className="w-5 h-5 text-white/80" />
                </div>
                <span className={labelClass}>Swap</span>
            </button>

            {isSol ? (
                <button onClick={onBuy} className={buttonClass}>
                    <div className={circleClass}>
                        <BuyCartIcon className="w-5 h-5 text-white/80" />
                    </div>
                    <span className={labelClass}>Buy</span>
                </button>
            ) : (
                <a
                    href={`https://solscan.io/token/${mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass}
                >
                    <div className={circleClass}>
                        <LinkSquareIcon className="w-5 h-5 text-white/80" />
                    </div>
                    <span className={labelClass}>Solscan</span>
                </a>
            )}
        </div>
    );
}
