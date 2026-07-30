"use client";

import * as React from "react";
import { Coins } from "lucide-react";
import { TokenIcon } from "./token-icon";
import { cn } from "@/lib/utils";
import type { ChainId } from "@/lib/chains/types";
import { getChainOrDefault } from "@/lib/chains/registry";
import { isVerifiedToken } from "@/lib/tokens/verified";
import { VerifiedTokenBadge } from "@/components/tokens/verified-token-badge";

interface TokenListItemProps {
    icon?: string;
    /** Mint / contract, for the verified check. */
    mint?: string;
    symbol: string;
    name: string;
    balance: number;
    usdValue?: number;
    priceChange24h?: number;
    hideBalances?: boolean;
    chain?: ChainId;
    isNative?: boolean;
    onClick?: () => void;
}

export function TokenListItem({
    icon,
    mint,
    symbol,
    name,
    balance,
    usdValue,
    priceChange24h,
    hideBalances,
    chain,
    isNative,
    onClick,
}: TokenListItemProps) {
    const verified = isVerifiedToken({ mint, chain, isNative });
    // Base's coin IS ether, so its symbol is ETH — identical to Ethereum's row
    // in a list that spans both. The chain qualifies it. Only for a chain's own
    // coin: on a token the corner badge already says which network, and
    // repeating it on every row would be noise.
    const config = chain ? getChainOrDefault(chain) : null;
    const nativeChain = isNative && config && config.kind !== "solana" ? config.name : null;
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center justify-between p-3.5 rounded-3xl bg-panel2 border-baseborder/20 border hover:bg-panel2 transition-all group cursor-pointer"
        >
            <div className="flex items-center gap-3">
                <TokenIcon
                    src={icon}
                    symbol={symbol}
                    size="lg"
                    type="token"
                    chain={chain}
                    isNative={isNative}
                />

                {/* Token Info */}
                <div className="flex flex-col items-start">
                    <p className="flex items-center gap-1.5 text-md font-semibold text-white/85 group-hover:text-white transition-colors">
                        {symbol}
                        {verified && <VerifiedTokenBadge />}
                        {nativeChain && (
                            <span className="text-sm font-medium text-zinc-500">{nativeChain}</span>
                        )}
                    </p>
                    <p className="text-md font-semibold text-zinc-500">
                        {hideBalances ? "••••••" : balance.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 4,
                        })}
                    </p>
                </div>
            </div>

            {/* Balance Info */}
            <div className="flex flex-col items-end">
                {hideBalances ? (
                    <>
                        <p className="text-md text-white">••••••</p>
                        <p className="text-md font-medium text-zinc-500">••••</p>
                    </>
                ) : (
                    <>
                        <p className="text-md text-white">
                            $
                            {(usdValue ?? 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </p>
                        <p className={cn(
                            "text-md font-medium",
                            (priceChange24h ?? 0) > 0 ? "text-[#75ba80]" : (priceChange24h ?? 0) < 0 ? "text-[#e07d6f]" : "text-zinc-500"
                        )}>
                            {(() => {
                                const percent = priceChange24h ?? 0;
                                const currentVal = usdValue ?? 0;
                                const usdChange = (percent !== 0 && percent > -100)
                                    ? currentVal - (currentVal / (1 + percent / 100))
                                    : (percent <= -100 ? -currentVal : 0);
                                const isPositive = usdChange > 0;
                                const isNegative = usdChange < 0;
                                return (
                                    <>
                                        {isPositive ? "+" : isNegative ? "-" : ""}${Math.abs(usdChange).toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </>
                                );
                            })()}
                        </p>
                    </>
                )}
            </div>
        </button>
    );
}
