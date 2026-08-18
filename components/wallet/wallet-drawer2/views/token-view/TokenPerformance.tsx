"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Token } from "../../types";
import { DrawerCard, DrawerDataRow } from "../../components/drawer-chrome";

interface TokenPerformanceProps {
    token: Token;
}

export function TokenPerformance({ token }: TokenPerformanceProps) {
    const priceChange = token.priceChange24h ?? 0;
    const isPositive = priceChange > 0;
    const isNegative = priceChange < 0;

    const rows = [
        {
            label: "24h change",
            value: `${isPositive ? "+" : ""}${priceChange.toFixed(2)}%`,
            valueClass: isPositive ? "text-lantern" : isNegative ? "text-pastelred" : "text-white",
        },
        ...(token.marketCap ? [{
            label: "Market cap",
            value: token.marketCap >= 1e9
                ? `$${(token.marketCap / 1e9).toFixed(2)}B`
                : token.marketCap >= 1e6
                    ? `$${(token.marketCap / 1e6).toFixed(2)}M`
                    : `$${token.marketCap.toLocaleString()}`,
            valueClass: "text-white",
        }] : []),
        ...(token.fdv ? [{
            label: "FDV",
            value: token.fdv >= 1e9
                ? `$${(token.fdv / 1e9).toFixed(2)}B`
                : token.fdv >= 1e6
                    ? `$${(token.fdv / 1e6).toFixed(2)}M`
                    : `$${token.fdv.toLocaleString()}`,
            valueClass: "text-white",
        }] : []),
    ];

    return (
        <DrawerCard className="py-1.5">
            {rows.map((row) => (
                <DrawerDataRow key={row.label} label={row.label}>
                    <span className={cn("tabular-nums", row.valueClass)}>{row.value}</span>
                </DrawerDataRow>
            ))}
        </DrawerCard>
    );
}
