"use client";

import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { Check, X, ArrowUpRight } from "lucide-react";

interface NFTSendToastData {
    status: "sending" | "sent" | "error";
    nftName: string;
    nftImage: string;
    recipientDisplay: string;
    txHash?: string;
    error?: string;
}

const TOAST_ID = "nft-send-tx";

function NFTSendToastContent({
    data,
    toastId,
}: {
    data: NFTSendToastData;
    toastId: string | number;
}) {
    const { status, nftName, nftImage, recipientDisplay, txHash, error } = data;
    const isSending = status === "sending";
    const isSent = status === "sent";
    const isError = status === "error";

    return (
        <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-[300px] bg-black1 border border-zinc-800/60 rounded-3xl p-4 flex flex-col gap-3 shadow-2xl"
        >
            {/* NFT + recipient */}
            <div className="flex items-center gap-3">
                <motion.div
                    className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-zinc-800"
                    layoutId="nft-thumb"
                >
                    {nftImage && (
                        <img src={nftImage} alt={nftName} className="w-full h-full object-cover" />
                    )}
                </motion.div>
                <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white truncate">{nftName}</p>
                    <p className="text-[12px] text-zinc-500 truncate">to {recipientDisplay}</p>
                </div>
                <button
                    onClick={() => toast.dismiss(toastId)}
                    className="p-1 rounded-full text-zinc-600 hover:text-zinc-400 transition-colors shrink-0 cursor-pointer"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Status row */}
            <div className="flex items-center gap-2.5">
                {/* Icon — springs in when state changes */}
                <AnimatePresence mode="wait">
                    {isSending && (
                        <motion.div
                            key="pulse"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 28 }}
                            className="w-2 h-2 rounded-full bg-[#A7A9FF] animate-pulse shrink-0"
                        />
                    )}
                    {isSent && (
                        <motion.div
                            key="check"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 22 }}
                            className="w-4 h-4 rounded-full bg-[#10B981] flex items-center justify-center shrink-0"
                        >
                            <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                        </motion.div>
                    )}
                    {isError && (
                        <motion.div
                            key="error"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 22 }}
                            className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0"
                        >
                            <X className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Label */}
                <AnimatePresence mode="wait">
                    <motion.span
                        key={status}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 4 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className={`text-[13px] font-medium flex-1 ${isSent ? "text-[#10B981]" : isError ? "text-red-400" : "text-zinc-300"
                            }`}
                    >
                        {isSending && "Sending NFT..."}
                        {isSent && "NFT sent!"}
                        {isError && (error ?? "Transaction failed")}
                    </motion.span>
                </AnimatePresence>

                {/* Orb explorer link — slides in on success */}
                <AnimatePresence>
                    {isSent && txHash && (
                        <motion.a
                            key="solscan"
                            href={`https://orbmarkets.io/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1, duration: 0.2, ease: "easeOut" }}
                            className="flex items-center gap-1 text-[12px] text-[#A7A9FF] hover:opacity-80 transition-opacity font-medium shrink-0"
                        >
                            View tx
                            <ArrowUpRight className="w-3 h-3" />
                        </motion.a>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

function render(data: NFTSendToastData) {
    toast.custom((id) => <NFTSendToastContent data={data} toastId={id} />, {
        id: TOAST_ID,
        duration: data.status === "sending" ? Infinity : data.status === "sent" ? 5000 : Infinity,
    });
}

export function debugNFTSendToast(status: NFTSendToastData["status"], txHash?: string, error?: string) {
    render({ nftName: "Mad Lads #1337", nftImage: "https://madlads.s3.us-west-2.amazonaws.com/images/1337.png", recipientDisplay: "@starlord", status, txHash, error });
}

export function showNFTSendToast(opts: {
    nftName: string;
    nftImage: string;
    recipientDisplay: string;
}) {
    const base = { ...opts, status: "sending" as const };
    render(base);

    return {
        success: (txHash?: string) => render({ ...base, status: "sent", txHash }),
        error: (message?: string) => render({ ...base, status: "error", error: message }),
        dismiss: () => toast.dismiss(TOAST_ID),
    };
}
