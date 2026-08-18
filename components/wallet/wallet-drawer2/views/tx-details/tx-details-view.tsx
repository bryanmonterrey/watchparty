"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
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
        <div className="flex h-full flex-col overflow-y-auto hidden-scrollbar bg-canvas text-white">
            {/* Header — 56px and 15px bold, the drawer's one header size. */}
            <div className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 bg-canvas/80 px-3 backdrop-blur-md">
                <div className="w-9 shrink-0" />
                <h2 className="min-w-0 flex-1 truncate text-center text-15 font-bold tracking-tight text-white">
                    {isSwap ? "Coin swap" : (transaction.isOutgoing ? "Sent" : "Received")}
                </h2>
                <button
                    onClick={onBack}
                    aria-label="Close"
                    className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white active:scale-95"
                >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-5" strokeWidth={2.5} />
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
                    {/* h-12 — the wide-CTA height from the design system. */}
                    <button
                        onClick={onBack}
                        className="h-12 w-full cursor-pointer rounded-full bg-white text-14 font-bold text-black transition-opacity hover:opacity-90 active:scale-[0.99]"
                    >
                        Close
                    </button>
                    {onReportSpam && !transaction.isSpam && (
                        <button
                            onClick={() => onReportSpam(transaction.signature)}
                            className="h-11 w-full cursor-pointer rounded-full text-12 font-semibold text-pastelred/80 transition-colors hover:bg-pastelred/10 hover:text-pastelred"
                        >
                            Report as spam
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
