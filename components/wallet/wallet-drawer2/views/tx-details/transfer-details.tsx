"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, ArrowDownLeft01Icon } from "@hugeicons/core-free-icons";
import { Transaction, Token } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { shortenWalletAddress } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";

interface TransferDetailsProps {
    transaction: Transaction;
    walletAddress?: string;
    tokens?: Token[];
}

const SOL_WSOL = "So11111111111111111111111111111111111111112";
const SOL_NATIVE = "So11111111111111111111111111111111111111111";

export function TransferDetails({ transaction, tokens }: TransferDetailsProps) {
    const isSent = transaction.isOutgoing;

    // 1. Try wallet tokens array first (fastest, cached)
    const lookupMint = transaction.tokenMint === SOL_WSOL ? SOL_NATIVE : transaction.tokenMint;
    const resolvedToken = tokens?.find(t => t.mint === lookupMint);

    // 2. Fetch directly from Helius DAS if wallet tokens didn't have an icon
    const needsFetch = !resolvedToken?.icon && !transaction.tokenIcon
        && !!transaction.tokenMint
        && transaction.tokenMint !== SOL_WSOL
        && transaction.tokenMint !== SOL_NATIVE;

    const { data: fetchedMeta } = trpc.wallet.getTokensByMints.useQuery(
        { ids: transaction.tokenMint ? [transaction.tokenMint] : [] },
        { enabled: needsFetch, staleTime: 5 * 60 * 1000 }
    );

    const tokenIcon = resolvedToken?.icon
        ?? transaction.tokenIcon
        ?? (transaction.tokenMint ? fetchedMeta?.[transaction.tokenMint]?.logoURI : undefined);

    const amountStr = transaction.amount.toLocaleString(undefined, { maximumFractionDigits: 5 });
    const dateStr = new Date(transaction.timestamp).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).replace(',', ' at');

    const statusLabel = transaction.status === "success" ? "Succeeded" : "Failed";
    const feeStr = transaction.networkFee != null
        ? `-${transaction.networkFee.toLocaleString(undefined, { maximumFractionDigits: 8 })} SOL`
        : null;

    return (
        <div className="w-full flex flex-col items-center">
            {/* Main Visual */}
            {/* Direction badge is neutral: it was #A294F9 with a black ring and
                a drop shadow — a lilac that exists nowhere else in the app, and
                a gray shadow, which the house rules forbid outright. */}
            <div className="relative mb-6">
                <div className="relative flex size-24 items-center justify-center overflow-hidden rounded-full bg-white/[0.04]">
                    <TokenIcon
                        src={tokenIcon}
                        symbol={resolvedToken?.symbol ?? transaction.tokenSymbol}
                        size="xl"
                        className="size-16"
                    />
                </div>
                <div className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-4 border-canvas bg-white text-black">
                    <HugeiconsIcon
                        icon={isSent ? ArrowUpRight01Icon : ArrowDownLeft01Icon}
                        className="size-4"
                        strokeWidth={3}
                    />
                </div>
            </div>

            {/* Amount */}
            <h1 className={`mb-8 text-[40px] font-bold tabular-nums tracking-tight ${!isSent ? 'text-lantern' : 'text-white'}`}>
                {isSent ? '-' : '+'}{amountStr} {transaction.tokenSymbol}
            </h1>

            {/* Info Card */}
            <div className="w-full overflow-hidden rounded-3xl border border-baseborder/20 bg-panel2">
                <div className="flex flex-col">
                    <DetailRow label="Date" value={dateStr} />
                    <DetailRow
                        label="Status"
                        value={statusLabel}
                        valueClassName={transaction.status === "success" ? "text-lantern" : "text-pastelred"}
                    />
                    {transaction.counterpartyAddress && (
                        <DetailRow
                            label={isSent ? "To" : "From"}
                            value={shortenWalletAddress(transaction.counterpartyAddress)}
                        />
                    )}
                    <DetailRow label="Network" value="Solana" />
                    {feeStr && <DetailRow label="Network fee" value={feeStr} />}

                    <button
                        onClick={() => window.open(`https://orbmarkets.io/tx/${transaction.signature}`, '_blank')}
                        className="mt-1 w-full cursor-pointer py-3.5 text-14 font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
                    >
                        View on Orb
                    </button>
                </div>
            </div>
        </div>
    );
}

function DetailRow({ label, value, valueClassName = "text-white" }: { label: string, value: string, valueClassName?: string }) {
    return (
        <div className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="shrink-0 text-13 font-medium text-zinc-500">{label}</span>
            <span className={`min-w-0 truncate text-14 font-semibold ${valueClassName}`}>{value}</span>
        </div>
    );
}
