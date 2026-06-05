"use client";

import * as React from "react";
import { Transaction, Token } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface SwapDetailsProps {
    transaction: Transaction;
    onSwapWith?: (token: Token) => void;
    tokens: Token[];
}

const SOL_WSOL = "So11111111111111111111111111111111111111112";
const SOL_NATIVE = "So11111111111111111111111111111111111111111";

function findInTokens(tokens: Token[], mint?: string): Token | undefined {
    if (!mint) return undefined;
    const lookupMint = mint === SOL_WSOL ? SOL_NATIVE : mint;
    return tokens.find(t => t.mint === lookupMint);
}

export function SwapDetails({ transaction, onSwapWith, tokens }: SwapDetailsProps) {
    // Use transaction icons as stable primary source — these are set server-side and never change.
    // Tokens lookup is only used to build the Token object for onTokenClick navigation.
    const solMints = new Set([SOL_WSOL, SOL_NATIVE]);
    const mintsToFetch = [transaction.tokenMint, transaction.secondaryTokenMint]
        .filter((m): m is string => !!m && !solMints.has(m));

    const paidInTokens = findInTokens(tokens, transaction.secondaryTokenMint);
    const receivedInTokens = findInTokens(tokens, transaction.tokenMint);

    // Fetch if icons OR symbols are missing
    const needsFetch = mintsToFetch.length > 0 && (
        (!transaction.secondaryTokenIcon && !paidInTokens?.icon) ||
        (!transaction.tokenIcon && !receivedInTokens?.icon) ||
        !transaction.secondaryTokenSymbol ||
        !transaction.tokenSymbol
    );

    const { data: fetchedMeta } = trpc.wallet.getTokensByMints.useQuery(
        { ids: mintsToFetch },
        { enabled: needsFetch, staleTime: 5 * 60 * 1000 }
    );

    // Stable icon: transaction icon first (set server-side, never changes), then fallbacks
    const paidIcon = transaction.secondaryTokenIcon
        ?? paidInTokens?.icon
        ?? (transaction.secondaryTokenMint ? fetchedMeta?.[transaction.secondaryTokenMint]?.logoURI : undefined);

    const receivedIcon = transaction.tokenIcon
        ?? receivedInTokens?.icon
        ?? (transaction.tokenMint ? fetchedMeta?.[transaction.tokenMint]?.logoURI : undefined);

    // Resolve symbols with the same fallback chain
    const paidSymbol = transaction.secondaryTokenSymbol
        ?? paidInTokens?.symbol
        ?? (transaction.secondaryTokenMint ? fetchedMeta?.[transaction.secondaryTokenMint]?.symbol : undefined)
        ?? "Unknown";

    const receivedSymbol = transaction.tokenSymbol
        ?? receivedInTokens?.symbol
        ?? (transaction.tokenMint ? fetchedMeta?.[transaction.tokenMint]?.symbol : undefined)
        ?? "Unknown";

    const paidToken: Token = paidInTokens || {
        mint: transaction.secondaryTokenMint || "",
        symbol: paidSymbol,
        name: paidSymbol,
        icon: paidIcon,
        balance: 0,
        decimals: 9,
    };

    const receivedToken: Token = receivedInTokens || {
        mint: transaction.tokenMint || "",
        symbol: receivedSymbol,
        name: receivedSymbol,
        icon: receivedIcon,
        balance: 0,
        decimals: 9,
    };

    const amountInStr = transaction.secondaryAmount?.toLocaleString(undefined, { maximumFractionDigits: 5 }) || "0";
    const amountOutStr = transaction.amount.toLocaleString(undefined, { maximumFractionDigits: 5 });

    const dateStr = new Date(transaction.timestamp).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
    }).replace(',', ' at');

    return (
        <div className="w-full flex flex-col items-center">
            {/* Main Visual */}
            <div className="flex items-center justify-center mb-6">
                <div className="relative flex items-center">
                    <div className="w-16 h-16 rounded-full bg-zinc-900 border-2 border-black flex items-center justify-center z-10 -mr-4 overflow-hidden">
                        <TokenIcon src={paidIcon} symbol={paidToken.symbol} size="lg" />
                    </div>
                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center z-0 overflow-hidden">
                        <TokenIcon src={receivedIcon} symbol={receivedToken.symbol} size="lg" />
                    </div>
                </div>
            </div>

            {/* Amount Title */}
            <h1 className="text-[32px] font-extrabold tracking-tight mb-8 text-center px-4 uppercase">
                {paidSymbol} → {receivedSymbol}
            </h1>

            {/* Info Card */}
            <div className="w-full bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden mb-8">
                <DetailRow label="Date" value={dateStr} />
                <DetailRow
                    label="Status"
                    value={transaction.status === "success" ? "Succeeded" : "Failed"}
                    valueClassName={transaction.status === "success" ? "text-[#00ED89]" : "text-red-400"}
                />
                <DetailRow label="Network" value="Solana" />
                {transaction.networkFee != null && (
                    <DetailRow
                        label="Network Fee"
                        value={`-${transaction.networkFee.toLocaleString(undefined, { maximumFractionDigits: 8 })} SOL`}
                    />
                )}
            </div>

            {/* Swap Details Section */}
            <div className="w-full space-y-3">
                <h3 className="text-[15px] font-semibold text-zinc-400 px-1">Swap Details</h3>
                <div className="w-full bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden">
                    <DetailRow
                        label="Provider"
                        value={<div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-full bg-[#AB9FF2]" /><span className="text-white/90">{transaction.source || "Jupiter"}</span></div>}
                    />
                    <InteractiveRow
                        label="You Paid"
                        value={`-${amountInStr} ${paidSymbol}`}
                        valueClassName="text-white/90"
                        onClick={() => onSwapWith?.(paidToken)}
                    />
                    <InteractiveRow
                        label="You Received"
                        value={`+${amountOutStr} ${receivedSymbol}`}
                        valueClassName="text-[#00ED89]"
                        onClick={() => onSwapWith?.(receivedToken)}
                    />
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

function DetailRow({ label, value, valueClassName = "text-white/90" }: { label: string; value: React.ReactNode; valueClassName?: string }) {
    return (
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 last:border-0">
            <span className="text-[15px] text-zinc-500 font-medium">{label}</span>
            {typeof value === 'string' ? (
                <span className={`text-[15px] font-medium ${valueClassName}`}>{value}</span>
            ) : value}
        </div>
    );
}

function InteractiveRow({ label, value, valueClassName = "text-white/90", onClick }: {
    label: string; value: string; valueClassName?: string; onClick?: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!onClick}
        >
            <span className="text-[15px] text-zinc-500 font-medium">{label}</span>
            <div className="flex items-center gap-1">
                <span className={`text-[15px] font-semibold ${valueClassName}`}>{value}</span>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
            </div>
        </button>
    );
}
