"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Token } from "../../types";

interface TokenPerformanceProps {
    token: Token;
}

export function TokenPerformance({ token }: TokenPerformanceProps) {
    const priceChange = token.priceChange24h ?? 0;
    const isPositive = priceChange > 0;
    const isNegative = priceChange < 0;

    const rows = [
        {
            label: "24h Change",
            value: `${isPositive ? "+" : ""}${priceChange.toFixed(2)}%`,
            valueClass: isPositive ? "text-[#75ba80]" : isNegative ? "text-[#e07d6f]" : "text-zinc-200",
        },
        ...(token.marketCap ? [{
            label: "Market Cap",
            value: token.marketCap >= 1e9
                ? `$${(token.marketCap / 1e9).toFixed(2)}B`
                : token.marketCap >= 1e6
                    ? `$${(token.marketCap / 1e6).toFixed(2)}M`
                    : `$${token.marketCap.toLocaleString()}`,
            valueClass: "text-zinc-200",
        }] : []),
        ...(token.fdv ? [{
            label: "FDV",
            value: token.fdv >= 1e9
                ? `$${(token.fdv / 1e9).toFixed(2)}B`
                : token.fdv >= 1e6
                    ? `$${(token.fdv / 1e6).toFixed(2)}M`
                    : `$${token.fdv.toLocaleString()}`,
            valueClass: "text-zinc-200",
        }] : []),
    ];

    return (
        <div className="bg-gray1 rounded-[22px] overflow-hidden">
            {rows.map((row, i) => (
                <div
                    key={row.label}
                    className={cn(
                        "flex items-center justify-between px-5 py-4",
                        i !== rows.length - 1 && "border-b border-white/5"
                    )}
                >
                    <span className="text-lg font-bold text-zinc-500">{row.label}</span>
                    <span className={cn("text-lg font-bold", row.valueClass)}>{row.value}</span>
                </div>
            ))}
        </div>
    );
}
