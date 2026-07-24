"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

interface SentStateProps {
    recipientDisplay: string;
    recipientAddress: string;
    txHash?: string;
}

export function SentState({ recipientDisplay, recipientAddress, txHash }: SentStateProps) {
    return (
        <motion.div
            key="sent"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center space-y-6"
        >
            <div className="w-24 h-24 rounded-full bg-zinc-900/50 flex items-center justify-center border border-white/5">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 200 }}
                    className="w-12 h-12 rounded-full bg-[#10B981] flex items-center justify-center"
                >
                    <Check className="w-6 h-6 text-black" strokeWidth={3} />
                </motion.div>
            </div>

            <div className="space-y-4 max-w-[280px]">
                <h2 className="text-[32px] font-bold text-white tracking-tight">Sent!</h2>
                <p className="text-[15px] text-zinc-500 leading-relaxed">
                    Your tokens were successfully sent to{" "}
                    <span className="text-white font-medium">{recipientDisplay}</span>{" "}
                    ({recipientAddress.slice(0, 4)}...{recipientAddress.slice(-4)})
                </p>
                {txHash && (
                    <a
                        href={`https://orbmarkets.io/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#A7A9FF] text-[15px] font-medium flex items-center gap-1.5 mx-auto hover:opacity-80 transition-opacity"
                    >
                        View transaction
                    </a>
                )}
            </div>
        </motion.div>
    );
}
