"use client";

import * as React from "react";
import { Transaction, Token } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
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
                    <div className="z-10 -mr-4 flex size-16 items-center justify-center overflow-hidden rounded-full border-4 border-canvas bg-white/[0.04]">
                        <TokenIcon src={paidIcon} symbol={paidToken.symbol} size="lg" />
                    </div>
                    <div className="z-0 flex size-16 items-center justify-center overflow-hidden rounded-full bg-white/[0.04]">
                        <TokenIcon src={receivedIcon} symbol={receivedToken.symbol} size="lg" />
                    </div>
                </div>
            </div>

            {/* Amount Title */}
            <h1 className="mb-8 px-4 text-center text-[32px] font-bold tracking-tight text-white">
                {paidSymbol} → {receivedSymbol}
            </h1>

            {/* Info Card */}
            <div className="mb-8 w-full overflow-hidden rounded-3xl border border-baseborder/20 bg-panel2">
                <DetailRow label="Date" value={dateStr} />
                <DetailRow
                    label="Status"
                    value={transaction.status === "success" ? "Succeeded" : "Failed"}
                    valueClassName={transaction.status === "success" ? "text-lantern" : "text-pastelred"}
                />
                <DetailRow label="Network" value="Solana" />
                {transaction.networkFee != null && (
                    <DetailRow
                        label="Network fee"
                        value={`-${transaction.networkFee.toLocaleString(undefined, { maximumFractionDigits: 8 })} SOL`}
                    />
                )}
            </div>

            {/* Swap Details Section */}
            <div className="w-full space-y-1">
                <h3 className="px-1.5 text-13 font-semibold text-zinc-500">Swap details</h3>
                <div className="w-full overflow-hidden rounded-3xl border border-baseborder/20 bg-panel2">
                    <DetailRow
                        label="Provider"
                        value={<div className="flex items-center gap-1.5"><span className="text-white">{transaction.source || "Jupiter"}</span></div>}
                    />
                    <InteractiveRow
                        label="You paid"
                        value={`-${amountInStr} ${paidSymbol}`}
                        valueClassName="text-white"
                        onClick={() => onSwapWith?.(paidToken)}
                    />
                    <InteractiveRow
                        label="You received"
                        value={`+${amountOutStr} ${receivedSymbol}`}
                        valueClassName="text-lantern"
                        onClick={() => onSwapWith?.(receivedToken)}
                    />
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

function DetailRow({ label, value, valueClassName = "text-white" }: { label: string; value: React.ReactNode; valueClassName?: string }) {
    return (
        <div className="flex items-center justify-between gap-4 px-5 py-3">
            <span className="shrink-0 text-13 font-medium text-zinc-500">{label}</span>
            {typeof value === 'string' ? (
                <span className={`min-w-0 truncate text-14 font-semibold ${valueClassName}`}>{value}</span>
            ) : value}
        </div>
    );
}

function InteractiveRow({ label, value, valueClassName = "text-white", onClick }: {
    label: string; value: string; valueClassName?: string; onClick?: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="flex w-full items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!onClick}
        >
            <span className="shrink-0 text-13 font-medium text-zinc-500">{label}</span>
            <div className="flex items-center gap-1">
                <span className={`min-w-0 truncate text-14 font-semibold ${valueClassName}`}>{value}</span>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-zinc-600" strokeWidth={2.5} />
            </div>
        </button>
    );
}
