"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { appToast } from "@/components/app-ui/app-toast";
import { motion, AnimatePresence } from "motion/react";

interface ReceiveActionsProps {
    walletAddress: string;
}

export function ReceiveActions({ walletAddress }: ReceiveActionsProps) {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = async () => {
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
        <div className="space-y-4">
            {/* Wallet Address Display */}
            <motion.button
                whileHover={{ backgroundColor: "#252526" }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCopy}
                className="w-full bg-[#1b1b1c] rounded-[24px] px-5 py-4 transition-colors cursor-pointer group relative overflow-hidden flex flex-col items-center"
            >
                <p className="text-[13px] font-medium text-zinc-500 mb-1 group-hover:text-zinc-400 transition-colors">Your Wallet Address</p>
                <p className="text-[14px] font-medium text-white break-all leading-relaxed">
                    {walletAddress}
                </p>
                <AnimatePresence>
                    {copied && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                            className="absolute inset-0 bg-blue-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none"
                        >
                            <span className="text-[14px] font-bold text-blue-400 flex items-center gap-2">
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
                className="cursor-pointer w-full py-4 rounded-full font-semibold text-lg transition-all flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-100 active:scale-[0.98]"
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
