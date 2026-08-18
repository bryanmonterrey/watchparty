"use client";

import { Transaction, Token } from "../../types";
import { TransactionItem } from "../../components/transaction-item";

interface ActivityGroupProps {
    label: string;
    txs: Transaction[];
    tokens: Token[];
    hideBalances?: boolean;
    onTransactionClick: (tx: Transaction) => void;
}

export function ActivityGroup({ label, txs, tokens, hideBalances, onTransactionClick }: ActivityGroupProps) {
    return (
        <div className="space-y-1">
            <h3 className="px-1.5 pb-0.5 text-13 font-semibold text-zinc-500">{label}</h3>
            <div className="space-y-1">
                {txs.map((tx) => (
                    <TransactionItem
                        key={tx.signature}
                        tx={tx}
                        tokens={tokens}
                        hideBalances={hideBalances}
                        onClick={() => onTransactionClick(tx)}
                    />
                ))}
            </div>
        </div>
    );
}
