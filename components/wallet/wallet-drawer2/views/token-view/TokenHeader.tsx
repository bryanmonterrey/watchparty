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
            <h1 className="mb-1 text-4xl font-bold tabular-nums tracking-tight text-white">
                ${displayValue.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                })}
            </h1>
            <div className="flex items-center gap-2">
                <span className={cn(
                    "text-15 font-bold tabular-nums",
                    isPositive ? "text-lantern" : isNegative ? "text-pastelred" : "text-zinc-500"
                )}>
                    {isPositive ? "+" : isNegative ? "-" : ""}${formatChangeAmount(usdChange)}
                </span>
                <div className={cn(
                    "rounded-full px-2 py-0.5 text-13 font-bold tabular-nums",
                    isPositive ? "bg-lantern/15 text-lantern" : isNegative ? "bg-pastelred/15 text-pastelred" : "bg-white/[0.06] text-zinc-500"
                )}>
                    {isPositive ? "+" : ""}{pctChange.toFixed(2)}%
                </div>
            </div>
        </div>
    );
}
