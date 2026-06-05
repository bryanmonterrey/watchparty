"use client";

"use client";

import * as React from "react";
import { Token, Transaction } from "../../types";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "boneyard-js/react";
import { TransactionItem } from "../../components/transaction-item";

interface TokenActivityProps {
    token: Token;
    tokens?: Token[];
    hideBalances?: boolean;
}

const SOL_MINTS = new Set([
    "So11111111111111111111111111111111111111111",
    "So11111111111111111111111111111111111111112",
]);

export function TokenActivity({ token, tokens = [], hideBalances }: TokenActivityProps) {
    const { data: transactions, isLoading } = trpc.wallet.getTransactions.useQuery(undefined, {
        staleTime: 30000,
    });

    const isSolToken = SOL_MINTS.has(token.mint);

    const tokenTransactions = React.useMemo(() => {
        if (!transactions) return [];
        return transactions
            .filter((tx: Transaction) => {
                const primaryMatch = tx.tokenMint === token.mint ||
                    (isSolToken && (!tx.tokenMint || SOL_MINTS.has(tx.tokenMint)));
                const secondaryMatch = tx.secondaryTokenMint === token.mint ||
                    (isSolToken && !!tx.secondaryTokenMint && SOL_MINTS.has(tx.secondaryTokenMint));
                return primaryMatch || secondaryMatch;
            })
            .slice(0, 3);
    }, [transactions, token.mint, isSolToken]);

    if (isLoading) {
        const mockTransactions: Transaction[] = [
            { signature: "mock1", type: "TRANSFER", timestamp: Date.now(), amount: 1.5, tokenMint: "So11111111111111111111111111111111111111112", tokenSymbol: "SOL", isOutgoing: false, status: "success", description: "Received SOL", source: "system" },
            { signature: "mock2", type: "SWAP", timestamp: Date.now(), amount: 100, tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", tokenSymbol: "USDC", isOutgoing: false, status: "success", description: "Swapped tokens", source: "system" },
            { signature: "mock3", type: "TRANSFER", timestamp: Date.now(), amount: 0.5, tokenMint: "So11111111111111111111111111111111111111112", tokenSymbol: "SOL", isOutgoing: true, status: "success", description: "Sent SOL", source: "system" },
        ];
        return (
            <Skeleton name="token-activity" loading={true}>
                <div className="space-y-2">
                    {mockTransactions.map((tx) => (
                        <TransactionItem key={tx.signature} tx={tx} tokens={tokens} hideBalances={hideBalances} />
                    ))}
                </div>
            </Skeleton>
        );
    }

    if (tokenTransactions.length === 0) {
        return (
            <div className="bg-gray1 p-4 rounded-2xl text-center text-zinc-500 text-sm">
                No activity for {token.symbol}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {tokenTransactions.map((tx: Transaction) => (
                <TransactionItem key={tx.signature} tx={tx} tokens={tokens} hideBalances={hideBalances} />
            ))}
        </div>
    );
}
