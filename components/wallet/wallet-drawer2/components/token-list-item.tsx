"use client";

import * as React from "react";
import { TokenIcon } from "./token-icon";
import { cn } from "@/lib/utils";
import type { ChainId } from "@/lib/chains/types";
import { getChainOrDefault } from "@/lib/chains/registry";
import { isVerifiedToken } from "@/lib/tokens/verified";
import { VerifiedTokenBadge } from "@/components/tokens/verified-token-badge";
import { PopNumber } from "@/components/ui/pop-number";

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
            // hover:bg-panel2 was a no-op — the row's own fill, so hovering did
            // nothing. Same wash the rest of the drawer uses now.
            className="group w-full cursor-pointer flex items-center justify-between rounded-3xl border border-baseborder/20 bg-panel2 p-3.5 transition-colors hover:bg-white/[0.05]"
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
                    {/* `text-md` is not a Tailwind class and is not declared in
                        globals.css, so every line in this row was inheriting its
                        size rather than setting one. The drawer's scale is 15px
                        bold for the primary value, 12px for the secondary. */}
                    <p className="flex items-center gap-1.5 text-14 font-bold tracking-tight text-white">
                        {symbol}
                        {verified && <VerifiedTokenBadge />}
                        {nativeChain && (
                            <span className="text-12 font-medium text-zinc-500">{nativeChain}</span>
                        )}
                    </p>
                    <p className="text-12 font-medium tabular-nums text-zinc-500">
                        {hideBalances ? "••••••" : (
                            <PopNumber
                                value={balance.toLocaleString(undefined, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 4,
                                })}
                            />
                        )}
                    </p>
                </div>
            </div>

            {/* Balance Info */}
            <div className="flex flex-col items-end">
                {hideBalances ? (
                    <>
                        <p className="text-14 font-bold tracking-tight text-white">••••••</p>
                        <p className="text-12 font-medium text-zinc-500">••••</p>
                    </>
                ) : (
                    <>
                        <p className="text-14 font-bold tabular-nums tracking-tight text-white">
                            <PopNumber
                                value={`$${(usdValue ?? 0).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}`}
                            />
                        </p>
                        {/* lantern / pastelred — the app's two semantic
                            colours. These were #75ba80 / #e07d6f, hexes minted
                            for this row and nowhere else. */}
                        <p className={cn(
                            "text-12 font-semibold tabular-nums",
                            (priceChange24h ?? 0) > 0 ? "text-lantern" : (priceChange24h ?? 0) < 0 ? "text-pastelred" : "text-zinc-500"
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
                                    <PopNumber
                                        value={`${isPositive ? "+" : isNegative ? "-" : ""}$${Math.abs(usdChange).toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}`}
                                    />
                                );
                            })()}
                        </p>
                    </>
                )}
            </div>
        </button>
    );
}
