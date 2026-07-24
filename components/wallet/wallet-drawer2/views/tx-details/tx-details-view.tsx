"use client";

import { X } from "lucide-react";
import { Transaction, Token } from "../../types";
import { SwapDetails } from "./swap-details";
import { TransferDetails } from "./transfer-details";

export interface TransactionDetailsViewProps {
    transaction: Transaction;
    onBack: () => void;
    onSwapWith?: (token: Token) => void;
    onReportSpam?: (signature: string) => void;
    tokens?: Token[];
    walletAddress?: string;
}

export function TransactionDetailsView({
    transaction,
    onBack,
    onSwapWith,
    onReportSpam,
    tokens,
    walletAddress
}: TransactionDetailsViewProps) {
    const isSwap = transaction.type === "SWAP";

    return (
        <div className="flex flex-col h-full bg-black rounded-2xl text-white overflow-y-auto hidden-scrollbar">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 sticky top-0 bg-black/80 backdrop-blur-md z-20">
                <div className="w-10" />
                <h2 className="text-[17px] font-bold tracking-tight text-white/90">
                    {isSwap ? "Token Swap" : (transaction.isOutgoing ? "Sent" : "Received")}
                </h2>
                <button
                    onClick={onBack}
                    className="w-10 h-10 cursor-pointer flex items-center justify-center rounded-full bg-zinc-900/50 hover:bg-zinc-800 transition-colors"
                >
                    <X className="w-5 h-5 text-zinc-400" />
                </button>
            </div>

            <div className="px-5 pb-8 flex flex-col items-center">
                {isSwap ? (
                    <SwapDetails
                        transaction={transaction}
                        onSwapWith={onSwapWith}
                        tokens={tokens || []}
                    />
                ) : (
                    <TransferDetails transaction={transaction} walletAddress={walletAddress} tokens={tokens} />
                )}

                <div className="w-full mt-8 flex flex-col gap-2">
                    <button
                        onClick={onBack}
                        className="w-full py-4 cursor-pointer rounded-full bg-white hover:bg-zinc-200 text-black font-bold text-lg transition-all"
                    >
                        Close
                    </button>
                    {onReportSpam && !transaction.isSpam && (
                        <button
                            onClick={() => onReportSpam(transaction.signature)}
                            className="w-full py-3 cursor-pointer rounded-full text-red-400/80 hover:text-red-400 hover:bg-red-500/10 text-sm font-medium transition-all"
                        >
                            Report as spam
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
