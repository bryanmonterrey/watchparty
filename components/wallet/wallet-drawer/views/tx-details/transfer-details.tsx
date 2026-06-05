"use client";

import * as React from "react";
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
            <div className="relative mb-6">
                <div className="w-24 h-24 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center relative overflow-hidden">
                    <TokenIcon
                        src={tokenIcon}
                        symbol={resolvedToken?.symbol ?? transaction.tokenSymbol}
                        size="xl"
                        className="w-16 h-16"
                    />
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#A294F9] flex items-center justify-center border-2 border-black shadow-lg">
                    {isSent ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-black"><path d="M7 17l10-10M7 7h10v10" /></svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-black"><path d="M7 7l10 10M17 7v10H7" /></svg>
                    )}
                </div>
            </div>

            {/* Amount */}
            <h1 className={`text-[40px] font-bold tracking-tight mb-8 ${!isSent ? 'text-[#00ED89]' : 'text-white'}`}>
                {isSent ? '-' : '+'}{amountStr} {transaction.tokenSymbol}
            </h1>

            {/* Info Card */}
            <div className="w-full bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden">
                <div className="flex flex-col">
                    <DetailRow label="Date" value={dateStr} />
                    <DetailRow
                        label="Status"
                        value={statusLabel}
                        valueClassName={transaction.status === "success" ? "text-[#00ED89]" : "text-red-400"}
                    />
                    {transaction.counterpartyAddress && (
                        <DetailRow
                            label={isSent ? "To" : "From"}
                            value={shortenWalletAddress(transaction.counterpartyAddress)}
                        />
                    )}
                    <DetailRow label="Network" value="Solana" />
                    {feeStr && <DetailRow label="Network Fee" value={feeStr} />}

                    <button
                        onClick={() => window.open(`https://orbmarkets.io/tx/${transaction.signature}`, '_blank')}
                        className="w-full cursor-pointer py-4 text-white font-medium text-[15px] hover:bg-white/5 transition-colors border-t border-white/5"
                    >
                        View on Orb
                    </button>
                </div>
            </div>
        </div>
    );
}

function DetailRow({ label, value, valueClassName = "text-white/90" }: { label: string, value: string, valueClassName?: string }) {
    return (
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 last:border-0">
            <span className="text-[15px] text-zinc-500 font-medium">{label}</span>
            <span className={`text-[15px] font-medium ${valueClassName}`}>{value}</span>
        </div>
    );
}
