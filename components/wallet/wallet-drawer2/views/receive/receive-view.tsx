"use client";

import * as React from "react";
import { ArrowLeft, CreditCard } from "lucide-react";
import { motion } from "framer-motion";
import { ReceiveQrCode } from "./receive-qr-code";
import { ReceiveActions } from "./receive-actions";
import { getChainOrDefault } from "@/lib/chains/registry";
import type { ChainId } from "@/lib/chains/types";


interface ReceiveViewProps {
    walletAddress: string;
    onBack: () => void;
    onBuy: () => void;
    chain?: ChainId;
}

// Per-chain deposit warning. Getting this wrong loses funds — an address is
// only valid on the network it was derived for, and the five EVM chains share
// an address but NOT their tokens.
const DEPOSIT_WARNING: Record<ChainId, string> = {
    solana: "only send SOL and SPL tokens to this address",
    ethereum: "only send ETH and ERC-20 tokens on Ethereum mainnet",
    bitcoin: "only send BTC on the Bitcoin network",
    base: "only send ETH and ERC-20 tokens on Base",
    sui: "only send SUI and Sui coins to this address",
    polygon: "only send POL and ERC-20 tokens on Polygon",
    hyperevm: "only send HYPE and tokens on HyperEVM",
    robinhood: "only send ETH and tokens on Robinhood Chain",
};

export function ReceiveView({ walletAddress, onBack, onBuy, chain = "solana" }: ReceiveViewProps) {
    const config = getChainOrDefault(chain);
    return (
        <motion.div
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="flex flex-col h-full"
        >
            {/* Header */}
            <div className="px-5 pt-5 pb-4 flex items-center relative flex-shrink-0">
                <button
                    onClick={onBack}
                    className="cursor-pointer p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors -ml-1 z-10"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-[18px] font-semibold text-white absolute left-0 right-0 text-center pointer-events-none">
                    Receive
                </span>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 flex flex-col pt-6">
                <ReceiveQrCode walletAddress={walletAddress} />

                <div className="flex-1 flex flex-col justify-end mt-auto space-y-3">
                    <div className="text-center px-4 space-y-1">
                        <p className="text-[14px] text-zinc-400 font-medium">
                            Scan this QR code or copy the address below
                        </p>
                        <p className="text-[13px] text-zinc-500">
                            {DEPOSIT_WARNING[config.id]}
                        </p>
                    </div>

                    <ReceiveActions walletAddress={walletAddress} />

                    <div className="pt-2">
                        <button
                            onClick={onBuy}
                            className="w-full cursor-pointer h-14 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold flex items-center justify-center gap-2 transition-all"
                        >
                            <CreditCard className="w-5 h-5" />
                            Buy {config.nativeCurrency.symbol} with Fiat
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
