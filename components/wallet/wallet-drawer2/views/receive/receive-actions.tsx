"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
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
                whileHover={{ backgroundColor: "#252526" }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCopy}
                disabled={!walletAddress}
                className="w-full bg-[#1b1b1c] rounded-[24px] px-5 py-4 transition-colors cursor-pointer group relative overflow-hidden flex flex-col items-center disabled:cursor-default"
            >
                <p className="text-[13px] font-medium text-zinc-500 mb-1 group-hover:text-zinc-400 transition-colors">Your Wallet Address</p>
                {walletAddress ? (
                    <p className="text-[14px] font-medium text-white break-all leading-relaxed">
                        {walletAddress}
                    </p>
                ) : missingAddress ? (
                    <p className="text-[14px] font-medium text-zinc-500">Not available yet</p>
                ) : (
                    <span className="my-[3px] h-4 w-[85%] rounded-full shimmer-skeleton" />
                )}
                <AnimatePresence>
                    {copied && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                            className="absolute inset-0 bg-bleu/10 backdrop-blur-sm flex items-center justify-center pointer-events-none"
                        >
                            <span className="text-[14px] font-bold text-bleu flex items-center gap-2">
                                <Check className="w-4 h-4" />
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
                className="cursor-pointer w-full py-4 rounded-full font-semibold text-lg transition-all flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-100 active:scale-[0.98] disabled:cursor-default disabled:opacity-40 disabled:active:scale-100"
            >
                {copied ? (
                    <>
                        <Check className="w-5 h-5" strokeWidth={2.5} />
                        Copied!
                    </>
                ) : (
                    <>
                        Copy Address
                    </>
                )}
            </button>
        </div>
    );
}
