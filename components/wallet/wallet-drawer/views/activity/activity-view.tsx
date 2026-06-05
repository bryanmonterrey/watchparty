"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { Transaction, Token } from "../../types";
import { trpc } from "@/lib/trpc/client";
import { format, isToday, isYesterday } from "date-fns";
import { ActivitySkeleton } from "./activity-skeleton";
import { ActivityGroup } from "./activity-group";

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
        <div className="flex flex-col h-full bg-black rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="sticky top-0 z-10 backdrop-blur-xs bg-black/80 rounded-t-2xl relative flex items-center justify-center px-5 pt-4 pb-2 min-h-[60px]">
                <button
                    onClick={onBack}
                    className="absolute left-3 p-2 rounded-full hover:bg-zinc-800/50 transition-colors cursor-pointer text-zinc-400 hover:text-white"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-2xl font-bold text-white/90">Activity</span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto hidden-scrollbar px-1 pb-10">
                <div className="px-4 py-2 space-y-6">
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
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                            <p className="text-sm">No recent transactions</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
