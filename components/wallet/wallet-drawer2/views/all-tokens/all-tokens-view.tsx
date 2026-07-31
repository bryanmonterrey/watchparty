"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Coins } from "lucide-react";
import { Token } from "../../types";
import { TokenListItem } from "../../components/token-list-item";
import { EmptyState } from "../../components/empty-state";

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
            className="flex flex-col h-full bg-[#0A0A0A] rounded-2xl overflow-hidden"
        >
            <div className="flex items-center justify-between rounded-t-2xl p-4 sticky top-0 bg-[#0A0A0A]/80 backdrop-blur-md z-10">
                <button
                    onClick={onBack}
                    className="p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white flex-1 text-center mr-8">
                    All Coins
                </h2>
            </div>

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
                            icon={Coins}
                            title="No Coins Found"
                            description="Your coin balances will appear here once you have assets."
                        />
                    )}
                </div>
            </div>
        </motion.div>
    );
}
