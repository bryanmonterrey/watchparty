"use client";

import { motion, AnimatePresence } from "motion/react";
import { SendingState } from "./sending-state";
import { SentState } from "./sent-state";

interface NFTStatusViewProps {
    status: "sending" | "sent" | "error";
    recipientDisplay: string;
    recipientAddress: string;
    onClose: () => void;
    txHash?: string;
}

export function NFTStatusView({
    status,
    recipientDisplay,
    recipientAddress,
    onClose,
    txHash,
}: NFTStatusViewProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col rounded-2xl h-full bg-canvas relative items-center justify-center px-8"
        >
            <AnimatePresence mode="wait">
                {status === "sending" && <SendingState />}
                {status === "sent" && (
                    <SentState
                        recipientDisplay={recipientDisplay}
                        recipientAddress={recipientAddress}
                        txHash={txHash}
                    />
                )}
            </AnimatePresence>

            <div className="absolute bottom-10 left-6 right-6">
                <button
                    onClick={onClose}
                    className="w-full h-14 rounded-2xl bg-white/[0.08] text-15 font-bold text-white hover:bg-white/[0.14] transition-all active:scale-[0.98] cursor-pointer"
                >
                    Close
                </button>
            </div>
        </motion.div>
    );
}
