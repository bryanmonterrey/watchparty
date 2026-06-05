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
        <div className="space-y-2">
            <h3 className="text-md font-semibold text-zinc-400 px-1">{label}</h3>
            <div className="space-y-2">
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
