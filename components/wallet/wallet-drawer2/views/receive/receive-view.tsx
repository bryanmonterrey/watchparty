"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { DrawerHeader } from "../../components/drawer-chrome";
import * as React from "react";
import { motion } from "motion/react";
import { ReceiveQrCode } from "./receive-qr-code";
import { ReceiveActions } from "./receive-actions";
import { getChainOrDefault } from "@/lib/chains/registry";
import { ChainIcon } from "@/components/wallet/chain-icon";
import type { ChainId } from "@/lib/chains/types";


interface ReceiveViewProps {
    /** Undefined while the per-chain address is still being fetched. */
    walletAddress?: string;
    /** True only while the address query is in flight. */
    loadingAddress?: boolean;
    /** Retry, for when the query settled without an address for this chain. */
    onRetryAddress?: () => void;
    onBack: () => void;
    onBuy: () => void;
    chain?: ChainId;
    onChangeNetwork?: () => void;
}

// Per-chain deposit warning. Getting this wrong loses funds — an address is
// only valid on the network it was derived for, and the five EVM chains share
// an address but NOT their tokens.
const DEPOSIT_WARNING: Record<ChainId, string> = {
    solana: "Only send SOL and SPL tokens to this address",
    ethereum: "Only send ETH and ERC-20 tokens on Ethereum mainnet",
    bitcoin: "Only send BTC on the Bitcoin network",
    base: "Only send ETH and ERC-20 tokens on Base",
    sui: "Only send SUI and Sui coins to this address",
    polygon: "Only send POL and ERC-20 tokens on Polygon",
    bnb: "Only send BNB and BEP-20 tokens on BNB Chain",
    hyperevm: "Only send HYPE and tokens on HyperEVM",
    robinhood: "Only send ETH and tokens on Robinhood Chain",
};

export function ReceiveView({
    walletAddress,
    loadingAddress,
    onRetryAddress,
    onBack,
    onBuy,
    chain = "solana",
    onChangeNetwork,
}: ReceiveViewProps) {
    const config = getChainOrDefault(chain);
    // Three states, not two. A missing address used to skeleton forever, which
    // looks identical to a hung request — so once the query has settled, say
    // plainly that there's no address for this chain and offer a retry.
    const missingAddress = !walletAddress && !loadingAddress;
    return (
        <motion.div
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="flex flex-col h-full"
        >
            <DrawerHeader title="Receive" onBack={onBack} />

            {/* Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 flex flex-col pt-2">
                {onChangeNetwork && (
                    <div className="flex justify-center pb-4">
                        <button
                            onClick={onChangeNetwork}
                            className="flex cursor-pointer items-center gap-2 rounded-full bg-white/[0.06] py-1.5 pl-1.5 pr-3.5 transition-colors hover:bg-white/[0.1]"
                        >
                            <ChainIcon chain={config.id} size={24} />
                            <span className="text-13 font-semibold text-white">{config.name}</span>
                            <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-zinc-400" />
                        </button>
                    </div>
                )}

                {walletAddress ? (
                    <ReceiveQrCode walletAddress={walletAddress} />
                ) : missingAddress ? (
                    <div className="mb-8 flex justify-center">
                        <div className="flex size-[224px] flex-col items-center justify-center gap-3 rounded-[32px] border border-baseborder/20 px-6 text-center">
                            <p className="text-12 font-medium text-zinc-400">
                                No {config.name} address yet
                            </p>
                            {onRetryAddress && (
                                <button
                                    onClick={onRetryAddress}
                                    className="cursor-pointer rounded-full bg-white/[0.06] px-3.5 py-1.5 text-12 font-semibold text-white transition-colors hover:bg-white/[0.1]"
                                >
                                    Try again
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="mb-8 flex justify-center">
                        <div className="size-[224px] rounded-[32px] border border-baseborder/20 shimmer-skeleton" />
                    </div>
                )}

                <div className="flex-1 flex flex-col justify-end mt-auto space-y-3">
                    <div className="text-center px-4 space-y-1">
                        <p className="text-13 text-zinc-400 font-medium">
                            Scan this QR code or copy the address below
                        </p>
                        <p className="text-12 text-zinc-500">
                            {DEPOSIT_WARNING[config.id]}
                        </p>
                    </div>

                    <ReceiveActions walletAddress={walletAddress} missingAddress={missingAddress} />

                    {/* "Buy <SOL> with Fiat" was here. Pulled until there's a
                        fiat on-ramp behind it — Stripe, see docs/TODO.md. A
                        button that opens nothing is worst exactly here, on the
                        screen people reach precisely because they hold no
                        balance.

                        `onBuy` stays on the props and stays wired from the
                        drawer, so restoring this is re-adding the markup rather
                        than re-threading a callback. git show the commit that
                        removed it for the original. */}
                </div>
            </div>
        </motion.div>
    );
}
