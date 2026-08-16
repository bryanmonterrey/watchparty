"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMarketCap } from "./market-cap-chip";
import { CoinImage } from "@/components/coins/coin-image";

// Compact token chip for identity rows (design brief §2): image + $TICKER +
// bonding progress inline pre-migration, market cap once migrated. Links to
// the token page at /{tokenId}. One pill, h-9, lantern accent.

export interface InlineChipToken {
    id: string;
    /** The mint, once launched. Absent on a draft. */
    tokenAddress?: string | null;
    ticker: string;
    imageUrl: string | null;
    marketCapUsd: number | null;
    bondingProgress: number | null; // 0–100
    phase: "new" | "migrating" | "migrated";
}

export function TokenInlineChip({ token, className }: { token: InlineChipToken; className?: string }) {
    const migrated = token.phase === "migrated";
    const progress = Math.max(0, Math.min(100, token.bondingProgress ?? 0));
    return (
        <Link
            href={`/coin/${token.id}`}
            className={cn(
                "flex h-9 items-center gap-2 rounded-full bg-white/5 pl-1.5 pr-3 ring-1 ring-white/10 transition-colors hover:bg-white/10",
                className,
            )}
        >
            <CoinImage src={token.imageUrl} className="size-6 shrink-0 rounded-full" />
            <span className="text-sm font-bold text-white">${token.ticker}</span>
            {migrated ? (
                token.marketCapUsd != null && (
                    <span className="text-xs font-bold text-lantern tabular-nums">{formatMarketCap(token.marketCapUsd)}</span>
                )
            ) : (
                <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10">
                        <span className="block h-full rounded-full bg-lantern" style={{ width: `${progress}%` }} />
                    </span>
                    <span className="text-[11px] font-bold text-lantern tabular-nums">{Math.round(progress)}%</span>
                </span>
            )}
        </Link>
    );
}
