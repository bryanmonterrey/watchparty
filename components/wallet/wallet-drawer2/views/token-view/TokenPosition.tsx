"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Token } from "../../types";
import { DRAWER_CARD } from "../../components/drawer-chrome";

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

    // Labels are sentence case at 13px zinc-500 — they were uppercase with
    // tracking-wide, the one uppercase run left in the drawer.
    const label = "text-13 font-medium text-zinc-500";
    const value = "text-[17px] font-bold tabular-nums leading-none tracking-tight text-white";

    return (
        <section className="space-y-1">
            <p className="px-1.5 pb-0.5 text-13 font-semibold text-zinc-500">Position</p>
            <div className="grid grid-cols-2 gap-1">
                <div className={cn(DRAWER_CARD, "flex flex-col gap-1.5 p-4")}>
                    <span className={label}>Balance</span>
                    <span className={value}>
                        {hideBalances ? "••••••" : token.balance.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 4,
                        })}
                    </span>
                </div>
                <div className={cn(DRAWER_CARD, "flex flex-col gap-1.5 p-4 text-right")}>
                    <span className={label}>Value</span>
                    <span className={value}>
                        {hideBalances ? "••••••" : `$${currentVal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}`}
                    </span>
                </div>
            </div>
            <div className={cn(DRAWER_CARD, "flex items-center justify-between p-4")}>
                <span className={label}>24h return</span>
                {hideBalances ? (
                    <span className="text-15 font-bold leading-none text-zinc-500">••••</span>
                ) : (
                    <span className={cn(
                        "text-15 font-bold tabular-nums leading-none",
                        usdChange > 0 ? "text-lantern" : usdChange < 0 ? "text-pastelred" : "text-zinc-500"
                    )}>
                        {usdChange > 0 ? "+" : usdChange < 0 ? "-" : ""}${Math.abs(usdChange).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                )}
            </div>
        </section>
    );
}
