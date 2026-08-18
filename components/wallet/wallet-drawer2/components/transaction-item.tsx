"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, ArrowDownLeft01Icon, Tick02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Transaction, Token } from "../types";
import { TokenIcon } from "./token-icon";

interface TransactionItemProps {
    tx: Transaction;
    tokens?: Token[];
    hideBalances?: boolean;
    onClick?: () => void;
}

// Same chrome as TokenListItem — panel2 fill, one baseborder hairline, 24px
// radius. The activity row used to be zinc-900 with a zinc-500/5 border, i.e. a
// visibly different card from the coin row directly above it in the same drawer.
export function TransactionItem({ tx, tokens = [], hideBalances, onClick }: TransactionItemProps) {
    const isSwap = tx.type === "SWAP";
    const isTransfer = tx.type === "TRANSFER";
    const isAppInteraction = !isSwap && !isTransfer;
    const failed = isAppInteraction && tx.status !== "success";

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
            className="group w-full cursor-pointer rounded-3xl border border-baseborder/20 bg-panel2 p-3.5 text-left transition-colors hover:bg-white/[0.05]"
        >
            <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                    {isAppInteraction ? (
                        // Success/failure is semantic, so it keeps its colour —
                        // lantern and pastelred, the app's two, instead of the
                        // one-off #1C3B2F / #3B1C1C discs this used to mix.
                        <div
                            className={cn(
                                "grid size-10 place-items-center rounded-full",
                                failed ? "bg-pastelred/15 text-pastelred" : "bg-lantern/15 text-lantern",
                            )}
                        >
                            <HugeiconsIcon
                                icon={failed ? Cancel01Icon : Tick02Icon}
                                className="size-5"
                                strokeWidth={2.5}
                            />
                        </div>
                    ) : isSwap && secondaryTokenSymbol ? (
                        <div className="relative size-10">
                            <TokenIcon
                                src={tx.tokenIcon}
                                symbol={tokenSymbol}
                                size="md"
                                className="absolute left-0 top-0 z-10 size-7 rounded-full"
                                innerClassName="w-full h-full"
                                type="token"
                            />
                            <TokenIcon
                                src={tx.secondaryTokenIcon}
                                symbol={secondaryTokenSymbol}
                                size="md"
                                className="absolute bottom-0 right-0 z-0 size-7 opacity-75"
                                innerClassName="w-full h-full"
                                type="token"
                            />
                        </div>
                    ) : (
                        <>
                            <TokenIcon src={tx.tokenIcon} symbol={tokenSymbol} size="lg" type="token" />
                            {/* Direction badge. Neutral now — it was violet-600,
                                a colour that exists nowhere else in the app, and
                                direction is already stated by the label and the
                                sign on the amount. */}
                            <div className="absolute -bottom-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full border-2 border-canvas bg-white/15 text-white">
                                <HugeiconsIcon
                                    icon={tx.isOutgoing ? ArrowUpRight01Icon : ArrowDownLeft01Icon}
                                    className="size-2.5"
                                    strokeWidth={3}
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-15 font-bold tracking-tight text-white">{label}</span>
                    <span className="line-clamp-1 text-13 font-medium text-zinc-500">{shortDesc}</span>
                </div>

                {hideBalances ? (
                    <span className="shrink-0 text-15 font-bold tracking-tight text-white">••••••</span>
                ) : (amountSol || (isSwap && secondaryAmount)) ? (
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                        {amountSol && (
                            <span
                                className={cn(
                                    "text-15 font-bold tabular-nums tracking-tight",
                                    // Incoming value is the only thing worth a
                                    // colour here; sends stay white.
                                    (isSwap || !tx.isOutgoing) ? "text-lantern" : "text-white",
                                )}
                            >
                                {isSwap ? "+" : (tx.isOutgoing ? "-" : "+")}{amountSol} {tokenSymbol}
                            </span>
                        )}
                        {isSwap && secondaryAmount && (
                            <span className="text-13 font-medium tabular-nums text-zinc-500">
                                -{secondaryAmount} {secondaryTokenSymbol}
                            </span>
                        )}
                    </div>
                ) : null}
            </div>
        </button>
    );
}
