"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { appToast } from "@/components/app-ui/app-toast";
import { motion, AnimatePresence } from "motion/react";

interface ReceiveActionsProps {
    /** Undefined while the per-chain address is still being fetched. */
    walletAddress?: string;
    /** The query settled with no address for this chain — say so, don't shimmer. */
    missingAddress?: boolean;
}

export function ReceiveActions({ walletAddress, missingAddress }: ReceiveActionsProps) {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = async () => {
        if (!walletAddress) return;
        try {
            await navigator.clipboard.writeText(walletAddress);
            setCopied(true);
            appToast.success("Address copied to clipboard!");

            setTimeout(() => setCopied(false), 2000);
        } catch {
            appToast.error("Failed to copy address");
        }
    };

    return (
        <div className="mx-auto w-3/4 space-y-4">
            {/* Wallet Address Display */}
            <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleCopy}
                disabled={!walletAddress}
                className="group relative flex w-full cursor-pointer flex-col items-center overflow-hidden rounded-3xl border border-baseborder/20 bg-panel2 px-5 py-4 transition-colors hover:bg-white/[0.05] disabled:cursor-default"
            >
                <p className="text-12 font-medium text-zinc-500 mb-1 group-hover:text-zinc-400 transition-colors">Your wallet address</p>
                {walletAddress ? (
                    <p className="text-13 font-medium text-white break-all leading-relaxed">
                        {walletAddress}
                    </p>
                ) : missingAddress ? (
                    <p className="text-13 font-medium text-zinc-500">Not available yet</p>
                ) : (
                    <span className="my-[3px] h-4 w-[85%] rounded-full shimmer-skeleton" />
                )}
                <AnimatePresence>
                    {copied && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/[0.06] backdrop-blur-sm"
                        >
                            <span className="flex items-center gap-2 text-13 font-bold text-white">
                                <HugeiconsIcon icon={Tick02Icon} className="size-4" />
                                Copied!
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.button>

            {/* Copy Button */}
            <button
                onClick={handleCopy}
                disabled={!walletAddress}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white text-14 font-bold text-black transition-opacity hover:opacity-90 active:scale-[0.99] disabled:cursor-default disabled:opacity-40 disabled:active:scale-100"
            >
                {copied ? (
                    <>
                        <HugeiconsIcon icon={Tick02Icon} className="size-5" strokeWidth={2.5} />
                        Copied!
                    </>
                ) : (
                    <>
                        Copy address
                    </>
                )}
            </button>
        </div>
    );
}
