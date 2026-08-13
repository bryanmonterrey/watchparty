"use client";

import Link from "next/link";
import { cn, shortenWalletAddress } from "@/lib/utils";

interface CoinResultCardProps {
    coin: {
        id: string;
        name: string | null;
        ticker: string | null;
        imageUrl: string | null;
        tokenAddress: string | null;
        price: number | null;
        change24h: number | null;
        marketCap: number | null;
        volume24h: number | null;
        href: string;
    };
    className?: string;
}

function formatPrice(price: number | null): string {
    if (price === null) return "—";
    if (price < 0.0001) return "< $0.0001";
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactUsd(n: number | null): string {
    if (n === null) return "—";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
}

/** A labelled figure ("MC $162.6M") — the desktop columns of the row. */
function Figure({ label, value }: { label: string; value: string }) {
    return (
        <div className="hidden sm:flex items-center gap-1.5 min-w-[92px] justify-end">
            <span className="text-xs font-semibold text-zinc-500 border rounded-md px-1.5 py-0.5">{label}</span>
            <span className="text-sm font-medium text-zinc-100 tabular-nums">{value}</span>
        </div>
    );
}

export function CoinResultCard({ coin, className }: CoinResultCardProps) {
    const isUp = (coin.change24h ?? 0) >= 0;
    return (
        <Link
            href={coin.href}
            className={cn("flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer w-full", className)}
        >
            {coin.imageUrl ? (
                <img src={coin.imageUrl} alt={coin.ticker ?? ""} className="w-10 h-10 rounded-full object-cover shrink-0" />
            ) : (
                <div className="w-10 h-10 rounded-full bg-zinc-800 shrink-0" />
            )}

            <div className="flex-1 min-w-0">
                <p className="font-bold text-[15px] text-zinc-100 truncate">{coin.ticker}</p>
                <p className="text-sm text-zinc-500 truncate">
                    {coin.name}
                    {coin.tokenAddress && (
                        <span className="text-zinc-600"> {shortenWalletAddress(coin.tokenAddress)}</span>
                    )}
                </p>
            </div>

            <Figure label="MC" value={formatCompactUsd(coin.marketCap)} />

            <div className="text-right shrink-0 min-w-[84px]">
                <p className="text-sm font-medium text-zinc-100 tabular-nums">{formatPrice(coin.price)}</p>
                {coin.change24h !== null && (
                    <p className={cn("text-xs font-medium tabular-nums", isUp ? "text-[#75ba80]" : "text-[#e07d6f]")}>
                        {isUp ? "▲" : "▼"} {Math.abs(coin.change24h).toFixed(2)}%
                    </p>
                )}
            </div>

            <Figure label="Vol" value={formatCompactUsd(coin.volume24h)} />
        </Link>
    );
}
