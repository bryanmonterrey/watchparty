"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Token } from "../../types";

interface TokenPositionProps {
    token: Token;
    hideBalances?: boolean;
}

export function TokenPosition({ token, hideBalances }: TokenPositionProps) {
    const priceChange = token.priceChange24h ?? 0;
    const currentVal = token.usdValue ?? 0;
    
    // Calculate USD change
    const usdChange = (priceChange !== 0 && priceChange > -100)
        ? currentVal - (currentVal / (1 + priceChange / 100))
        : (priceChange <= -100 ? -currentVal : 0);

    return (
        <div className="space-y-3">
            <h3 className="text-lg font-bold text-white/90">Position</h3>
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray1 p-4 rounded-2xl flex flex-col gap-1">
                    <span className="text-[13px] font-bold text-zinc-500 uppercase tracking-wide">Balance</span>
                    <span className="text-[17px] font-bold text-white leading-none">
                        {hideBalances ? "••••••" : token.balance.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 4,
                        })}
                    </span>
                </div>
                <div className="bg-gray1 p-4 rounded-2xl flex flex-col gap-1 text-right">
                    <span className="text-[13px] font-bold text-zinc-500 uppercase tracking-wide">Value</span>
                    <span className="text-[17px] font-bold text-white leading-none">
                        {hideBalances ? "••••••" : `$${currentVal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}`}
                    </span>
                </div>
            </div>
            <div className="bg-gray1 p-4 rounded-2xl flex items-center justify-between">
                <span className="text-[13px] font-bold text-zinc-500 uppercase tracking-wide">24h Return</span>
                {hideBalances ? (
                    <span className="text-[15px] font-bold leading-none text-zinc-500">••••</span>
                ) : (
                    <span className={cn(
                        "text-[15px] font-bold leading-none",
                        usdChange > 0 ? "text-[#75ba80]" : usdChange < 0 ? "text-[#e07d6f]" : "text-zinc-500"
                    )}>
                        {usdChange > 0 ? "+" : usdChange < 0 ? "-" : ""}${Math.abs(usdChange).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                )}
            </div>
        </div>
    );
}
