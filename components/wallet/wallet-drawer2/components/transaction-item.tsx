"use client";

import * as React from "react";
import { ArrowUpRight, ArrowDownToLine, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Transaction, Token } from "../types";
import { TokenIcon } from "./token-icon";

interface TransactionItemProps {
    tx: Transaction;
    tokens?: Token[];
    hideBalances?: boolean;
    onClick?: () => void;
}

export function TransactionItem({ tx, tokens = [], hideBalances, onClick }: TransactionItemProps) {
    const isSwap = tx.type === "SWAP";
    const isTransfer = tx.type === "TRANSFER";
    const isAppInteraction = !isSwap && !isTransfer;

    const shortDesc = tx.description || tx.source || "App interaction";
    const label = isAppInteraction
        ? (tx.status === "success" ? "App interaction" : "Failed app interaction")
        : (isSwap ? "Swapped" : (tx.isOutgoing ? "Sent" : "Received"));

    const amountSol = tx.amount > 0
        ? tx.amount.toLocaleString(undefined, { maximumFractionDigits: 5 })
        : null;

    const tokenSymbol = tx.tokenSymbol && tx.tokenSymbol !== "TOKEN"
        ? tx.tokenSymbol
        : (tx.tokenMint ? (tokens.find(t => t.mint === tx.tokenMint)?.symbol || tx.tokenMint.slice(0, 4)) : "SOL");

    const secondaryAmount = tx.secondaryAmount && tx.secondaryAmount > 0
        ? tx.secondaryAmount.toLocaleString(undefined, { maximumFractionDigits: 5 })
        : null;

    const secondaryTokenSymbol = tx.secondaryTokenSymbol && tx.secondaryTokenSymbol !== "TOKEN"
        ? tx.secondaryTokenSymbol
        : (tx.secondaryTokenMint ? (tokens.find(t => t.mint === tx.secondaryTokenMint)?.symbol || tx.secondaryTokenMint.slice(0, 4)) : "SOL");

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center justify-between p-3 rounded-3xl bg-zinc-900 border-zinc-500/5 border hover:bg-zinc-800/70 transition-all group cursor-pointer text-left gap-4"
        >
            {/* Icon */}
            <div className="relative flex-shrink-0">
                {isAppInteraction ? (
                    <div className={cn(
                        "w-11 h-11 rounded-full flex items-center justify-center"
                        
                    )}>
                        {tx.status === "success" ? (
                            <div className="w-8 h-8 rounded-full bg-[#1C3B2F] flex items-center justify-center">
                                <Check className="w-5 h-5 text-[#00ED89] stroke-[3]" />
                            </div>
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-[#3B1C1C] flex items-center justify-center">
                                <X className="w-5 h-5 text-red-500 stroke-[3]" />
                            </div>
                        )}
                    </div>
                ) : isSwap && secondaryTokenSymbol ? (
                    <div className="relative w-11 h-11">
                        <TokenIcon
                            src={tx.tokenIcon}
                            symbol={tokenSymbol}
                            size="md"
                            className="absolute top-0 left-0 z-10 w-7 h-7 rounded-full"
                            innerClassName="w-full h-full"
                            type="token"
                        />
                        <TokenIcon
                            src={tx.secondaryTokenIcon}
                            symbol={secondaryTokenSymbol}
                            size="md"
                            className="absolute bottom-0 right-0 z-0 w-7 h-7 opacity-75"
                            innerClassName="w-full h-full"
                            type="token"
                        />
                    </div>
                ) : (
                    <>
                        <TokenIcon src={tx.tokenIcon} symbol={tokenSymbol} size="md" type="token" />
                        <div className={cn(
                            "absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-zinc-950 shadow-sm",
                            tx.isOutgoing ? "bg-violet-600" : "bg-zinc-950"
                        )}>
                            {tx.isOutgoing ? (
                                <ArrowUpRight className="w-2.5 h-2.5 text-white stroke-[3]" />
                            ) : (
                                <ArrowDownToLine className="w-2.5 h-2.5 text-violet-400 stroke-[3]" />
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Label + description */}
            <div className="flex flex-col min-w-0 flex-1 gap-0">
                <span className="text-[17px] font-bold text-white tracking-tight leading-snug whitespace-nowrap">{label}</span>
                <span className="text-[14px] text-zinc-500 line-clamp-1 leading-snug">{shortDesc}</span>
            </div>

            {/* Amount */}
            {hideBalances ? (
                <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[17px] font-bold text-white/90 tracking-tight leading-none">••••••</span>
                </div>
            ) : (amountSol || (isSwap && secondaryAmount)) ? (
                <div className="flex flex-col items-end gap-0.5 min-w-[100px]">
                    {amountSol && (
                        <span className={cn(
                            "text-[17px] font-bold flex-shrink-0 tracking-tight leading-none",
                            (isSwap || !tx.isOutgoing) ? "text-[#00ED89]" : "text-white/90"
                        )}>
                            {isSwap ? "+" : (tx.isOutgoing ? "-" : "+")}{amountSol} {tokenSymbol}
                        </span>
                    )}
                    {isSwap && secondaryAmount && (
                        <span className="text-[14px] font-medium text-zinc-500 tracking-tight leading-none">
                            -{secondaryAmount} {secondaryTokenSymbol}
                        </span>
                    )}
                </div>
            ) : null}
        </button>
    );
}
