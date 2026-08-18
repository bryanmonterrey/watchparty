"use client";

import * as React from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Coins01Icon } from "@hugeicons/core-free-icons";
import { Token } from "../../types";
import { TokenListItem } from "../../components/token-list-item";
import { EmptyState } from "../../components/empty-state";
import { DrawerHeader } from "../../components/drawer-chrome";

// Every holding across every chain, in the same value-sorted order the merged
// list already uses. The main tab shows only the four headline coins; this is
// where the long tail lives, so it is a plain list with no extra filtering of
// its own — the hide-dust settings have already been applied upstream.
interface AllTokensViewProps {
    tokens: Token[];
    hideBalances?: boolean;
    onBack: () => void;
    onTokenClick: (token: Token) => void;
}

// Solana's coin arrives under the internal all-ones mint rather than the
// `native:<chain>` key the EVM/BTC pipeline synthesizes. Kept in sync with the
// same constant in wallet-tabs.
const SOL_NATIVE_MINT = "So11111111111111111111111111111111111111111";

function isNativeCoin(t: Token) {
    return t.mint.startsWith("native:") || t.mint === SOL_NATIVE_MINT;
}

export function AllTokensView({ tokens, hideBalances, onBack, onTokenClick }: AllTokensViewProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            // bg-canvas, not #0A0A0A — a one-off near-black that read as a
            // lighter sheet stacked on the drawer it slides over.
            className="flex h-full flex-col overflow-hidden bg-canvas"
        >
            <DrawerHeader title="All coins" onBack={onBack} className="sticky top-0 z-10 bg-canvas/80 backdrop-blur-md" />

            <div className="flex-1 overflow-y-auto hidden-scrollbar">
                <div className="space-y-1 p-5 pt-2">
                    {tokens.length > 0 ? (
                        tokens.map((token) => (
                            <TokenListItem
                                // Chain-qualified: the same contract address can
                                // exist on several EVM chains, so the mint alone
                                // is not unique here.
                                key={`${token.chain ?? "solana"}:${token.mint}`}
                                icon={token.icon}
                                symbol={token.symbol}
                                name={token.name}
                                balance={token.balance}
                                usdValue={token.usdValue}
                                priceChange24h={token.priceChange24h}
                                hideBalances={hideBalances}
                                chain={token.chain}
                                isNative={isNativeCoin(token)}
                                onClick={() => onTokenClick(token)}
                            />
                        ))
                    ) : (
                        <EmptyState
                            icon={<HugeiconsIcon icon={Coins01Icon} className="size-5" strokeWidth={2} />}
                            title="No coins yet"
                            description="Your coin balances show up here once you hold something."
                        />
                    )}
                </div>
            </div>
        </motion.div>
    );
}
