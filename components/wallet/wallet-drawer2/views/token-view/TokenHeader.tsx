"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Token } from "../../types";

interface TokenHeaderProps {
    token: Token;
    hoveredValue?: number | null;
    periodStartValue?: number | null;
}

// Shows enough decimal places so small amounts like $0.00345 never round to $0.00
function formatChangeAmount(amount: number): string {
    const abs = Math.abs(amount);
    if (abs >= 0.01) {
        return abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

export function TokenHeader({ token, hoveredValue, periodStartValue }: TokenHeaderProps) {
    const tokenPrice = token.price ?? 0;
    const displayValue = hoveredValue ?? tokenPrice;

    let usdChange: number;
    let pctChange: number;

    if (periodStartValue != null && periodStartValue !== 0) {
        usdChange = displayValue - periodStartValue;
        pctChange = (usdChange / periodStartValue) * 100;
    } else {
        const p = token.priceChange24h ?? 0;
        usdChange = (p !== 0 && p > -100)
            ? tokenPrice - tokenPrice / (1 + p / 100)
            : (p <= -100 ? -tokenPrice : 0);
        pctChange = p;
    }

    const isPositive = usdChange > 0;
    const isNegative = usdChange < 0;

    return (
        <div className="px-5 pt-2 pb-4 flex flex-col items-center">
            <h1 className="text-4xl font-bold text-white mb-1">
                ${displayValue.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                })}
            </h1>
            <div className="flex items-center gap-2">
                <span className={cn(
                    "text-[15px] font-bold",
                    isPositive ? "text-[#75ba80]" : isNegative ? "text-[#e07d6f]" : "text-zinc-500"
                )}>
                    {isPositive ? "+" : isNegative ? "-" : ""}${formatChangeAmount(usdChange)}
                </span>
                <div className={cn(
                    "px-2 py-0.5 rounded-md text-[13px] font-bold",
                    isPositive ? "bg-[#75ba80]/20 text-[#75ba80]" : isNegative ? "bg-[#e07d6f]/20 text-[#e07d6f]" : "bg-zinc-800 text-zinc-500"
                )}>
                    {isPositive ? "+" : ""}{pctChange.toFixed(2)}%
                </div>
            </div>
        </div>
    );
}
