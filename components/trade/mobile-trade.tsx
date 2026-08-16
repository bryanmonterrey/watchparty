"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Users, Globe, Eye, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { cn } from "@/lib/utils";
import { CoinImage } from "@/components/coins/coin-image";
import type { TokenStatus, TradeToken } from "./types";

// Mobile trade from "public/mobile designs/Trade page mobile landing.svg":
// single token list with a status dropdown (New/Migrating/Migrated) and
// market-cap sort, replacing the desktop three-column board. Shares the
// trade.getFeed cache with the desktop view; realtime push stays desktop-only
// (mobile rides the 15s refetch).

const EMPTY: Record<TokenStatus, TradeToken[]> = { new: [], migrating: [], migrated: [] };

const STATUS_LABEL: Record<TokenStatus, string> = {
    new: "New",
    migrating: "Migrating",
    migrated: "Migrated",
};

function fmtCap(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
    return `$${n.toFixed(0)}`;
}

function TokenRow({ token }: { token: TradeToken }) {
    const href = `/coin/${token.tokenAddress ?? token.id}`;
    const up = token.changePercent >= 0;

    return (
        <Link href={href} className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
            {/* Token image with bonding ring + alert dot, per the design */}
            <div className="relative shrink-0">
                <div className="size-14 overflow-hidden rounded-xl bg-muted ring-2 ring-lantern">
                    <CoinImage src={token.imageUrl} alt={token.name} coin={`${token.symbol}:${token.tokenAddress || token.id}`} className="size-full" />
                </div>
                <span className="absolute -bottom-1 -right-1 size-4 rounded-full bg-pastelred ring-2 ring-card" />
            </div>

            {/* Name, age, stat icons */}
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <p className="truncate text-lg font-extrabold">{token.name}</p>
                    <span className="truncate text-sm text-muted-foreground">{token.symbol}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2.5 text-muted-foreground">
                    <span className="text-sm font-bold text-lantern">{token.timeAgo}</span>
                    <span className="flex items-center gap-0.5 text-xs"><Users className="size-3.5" />{token.holderCount}</span>
                    {token.hasSocials.website && <Globe className="size-3.5" />}
                    <span className="flex items-center gap-0.5 text-xs"><Eye className="size-3.5" />{token.txCount}</span>
                </div>
            </div>

            {/* Chart button + market cap */}
            <span className="rounded-lg border border-lantern/60 bg-lantern/15 px-3.5 py-2 text-sm font-semibold">
                Chart
            </span>
            <div className="w-[72px] text-right">
                <p className="text-base font-extrabold">{fmtCap(token.marketCap)}</p>
                <p className={cn("text-sm font-bold", up ? "text-lantern" : "text-red2")}>
                    {up ? "+" : ""}{token.changePercent.toFixed(3)}%
                </p>
            </div>
        </Link>
    );
}

export function MobileTrade() {
    const [status, setStatus] = useState<TokenStatus>("new");
    const { data = EMPTY, isLoading } = trpc.trade.getFeed.useQuery(undefined, {
        refetchInterval: 15_000,
        refetchOnWindowFocus: true,
    });

    const tokens = [...data[status]].sort((a, b) => b.marketCap - a.marketCap);

    return (
        <div className="pt-16">
            {/* Title row: Trade + SOL chip + settings (header shows only the title) */}
            <div className="flex items-center justify-between px-4 pb-3 pt-2">
                <GooDropdown
                    align="start"
                    width={200}
                    triggerClassName="flex items-center gap-1 rounded-full bg-muted px-4 py-1.5 text-sm font-bold"
                    trigger={
                        <>
                            {STATUS_LABEL[status]} <ChevronDown className="size-4" />
                        </>
                    }
                    items={(Object.keys(STATUS_LABEL) as TokenStatus[]).map((s) => ({
                        key: s,
                        label: `${STATUS_LABEL[s]} (${data[s].length})`,
                        onClick: () => setStatus(s),
                    }))}
                />
                <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">Market Cap</span>
                    <Settings className="size-5 text-muted-foreground" />
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-px">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-none" />
                    ))}
                </div>
            ) : tokens.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No {STATUS_LABEL[status].toLowerCase()} tokens right now.
                </p>
            ) : (
                <div>
                    {tokens.map((t) => <TokenRow key={t.id} token={t} />)}
                </div>
            )}
        </div>
    );
}
