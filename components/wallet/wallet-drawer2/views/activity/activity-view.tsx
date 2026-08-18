"use client";

import * as React from "react";
import { Transaction, Token } from "../../types";
import { trpc } from "@/lib/trpc/client";
import { format, isToday, isYesterday } from "date-fns";
import { ActivitySkeleton } from "./activity-skeleton";
import { ActivityGroup } from "./activity-group";
import { DrawerHeader, DrawerEmptyState } from "../../components/drawer-chrome";

interface ActivityViewProps {
    tokens: Token[];
    onBack: () => void;
    onTransactionClick: (tx: Transaction) => void;
    hideBalances?: boolean;
}

export function ActivityView({ tokens, onBack, onTransactionClick, hideBalances }: ActivityViewProps) {
    const { data: transactions, isLoading } = trpc.wallet.getTransactions.useQuery(undefined, {
        staleTime: 30000,
    });

    const groupedTransactions = React.useMemo(() => {
        if (!transactions) return [];

        const groups: { label: string; txs: Transaction[] }[] = [];
        const sortedTxs = [...transactions].sort((a, b) => b.timestamp - a.timestamp);

        sortedTxs.forEach((tx) => {
            const date = new Date(tx.timestamp);
            let label = "";

            if (isToday(date)) {
                label = "Today";
            } else if (isYesterday(date)) {
                label = "Yesterday";
            } else {
                label = format(date, "MMMM d, yyyy");
            }

            let group = groups.find((g) => g.label === label);
            if (!group) {
                group = { label, txs: [] };
                groups.push(group);
            }
            group.txs.push(tx);
        });

        return groups;
    }, [transactions]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-canvas">
            <DrawerHeader title="Activity" onBack={onBack} className="sticky top-0 z-10 bg-canvas/80 backdrop-blur-md" />

            {/* Content */}
            <div className="flex-1 overflow-y-auto hidden-scrollbar pb-10">
                <div className="space-y-5 px-5 pt-1">
                    {isLoading ? (
                        <ActivitySkeleton />
                    ) : groupedTransactions.length > 0 ? (
                        groupedTransactions.map((group) => (
                            <ActivityGroup
                                key={group.label}
                                label={group.label}
                                txs={group.txs}
                                tokens={tokens}
                                hideBalances={hideBalances}
                                onTransactionClick={onTransactionClick}
                            />
                        ))
                    ) : (
                        <DrawerEmptyState
                            title="No activity yet"
                            description="Transactions show up here once you start using this wallet."
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
