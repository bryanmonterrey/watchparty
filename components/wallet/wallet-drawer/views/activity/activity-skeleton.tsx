"use client";

import { Skeleton } from "boneyard-js/react";
import { ActivityGroup } from "./activity-group";
import { Transaction } from "../../types";

const MOCK_TRANSACTIONS: Transaction[] = [
    { signature: "mock1", type: "TRANSFER", timestamp: Date.now() - 1000 * 60 * 10, amount: 1.5, tokenMint: "So11111111111111111111111111111111111111112", tokenSymbol: "SOL", isOutgoing: false, status: "success", description: "Received SOL", source: "system" },
    { signature: "mock2", type: "SWAP", timestamp: Date.now() - 1000 * 60 * 30, amount: 100, tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", tokenSymbol: "USDC", isOutgoing: false, status: "success", description: "Swapped tokens", source: "system" },
    { signature: "mock3", type: "TRANSFER", timestamp: Date.now() - 1000 * 60 * 60, amount: 0.5, tokenMint: "So11111111111111111111111111111111111111112", tokenSymbol: "SOL", isOutgoing: true, status: "success", description: "Sent SOL", source: "system" },
    { signature: "mock4", type: "TRANSFER", timestamp: Date.now() - 1000 * 60 * 60 * 24, amount: 2.0, tokenMint: "So11111111111111111111111111111111111111112", tokenSymbol: "SOL", isOutgoing: false, status: "success", description: "Received SOL", source: "system" },
    { signature: "mock5", type: "SWAP", timestamp: Date.now() - 1000 * 60 * 60 * 25, amount: 50, tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", tokenSymbol: "USDC", isOutgoing: false, status: "success", description: "Swapped tokens", source: "system" },
    { signature: "mock6", type: "TRANSFER", timestamp: Date.now() - 1000 * 60 * 60 * 48, amount: 0.25, tokenMint: "So11111111111111111111111111111111111111112", tokenSymbol: "SOL", isOutgoing: true, status: "success", description: "Sent SOL", source: "system" },
];

const MOCK_GROUPS = [
    { label: "Today", txs: MOCK_TRANSACTIONS.slice(0, 2) },
    { label: "Yesterday", txs: MOCK_TRANSACTIONS.slice(2, 4) },
    { label: "March 27, 2026", txs: MOCK_TRANSACTIONS.slice(4, 6) },
];

export function ActivitySkeleton() {
    return (
        <Skeleton name="activity-item" loading={true}>
            <div className="space-y-6">
                {MOCK_GROUPS.map((group) => (
                    <ActivityGroup
                        key={group.label}
                        label={group.label}
                        txs={group.txs}
                        tokens={[]}
                        onTransactionClick={() => {}}
                    />
                ))}
            </div>
        </Skeleton>
    );
}
