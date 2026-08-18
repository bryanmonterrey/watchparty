"use client";

import * as React from "react";
import { Token, Transaction } from "../../types";
import { trpc } from "@/lib/trpc/client";
import { TransactionItem } from "../../components/transaction-item";
import { ActivityListSkeleton } from "../../components/wallet-skeletons";
import { DrawerEmptyState } from "../../components/drawer-chrome";

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
        return <ActivityListSkeleton />;
    }

    if (tokenTransactions.length === 0) {
        return (
            <DrawerEmptyState
                title={`No ${token.symbol} activity yet`}
                description="Sends, receives and swaps of this coin show up here."
            />
        );
    }

    return (
        <div className="space-y-1">
            {tokenTransactions.map((tx: Transaction) => (
                <TransactionItem key={tx.signature} tx={tx} tokens={tokens} hideBalances={hideBalances} />
            ))}
        </div>
    );
}
