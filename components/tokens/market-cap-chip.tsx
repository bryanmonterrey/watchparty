"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/** $1.2B / $48M / $982K / $640 — trimmed to stay chip-sized. */
export function formatMarketCap(mc: number): string {
    const trim = (n: number) => (n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ""));
    if (mc >= 1_000_000_000) return `$${trim(mc / 1_000_000_000)}B`;
    if (mc >= 1_000_000) return `$${trim(mc / 1_000_000)}M`;
    if (mc >= 1_000) return `$${trim(mc / 1_000)}K`;
    return `$${Math.round(mc)}`;
}

interface MarketCapChipProps {
    /** Token mint — the chip navigates to /{tokenAddress} (token page). */
    tokenAddress: string | null | undefined;
    marketCap: number | null | undefined;
    ticker?: string | null;
    /** Market cap only (no ticker) — for narrow surfaces like closed carousel peeks. */
    compact?: boolean;
    className?: string;
}

/**
 * Market-cap pill for video surfaces (hero carousel, section cards, feed
 * cards). Frosted black like the rest of the over-thumbnail chrome (LIVE
 * badge, time nail); mcap in emerald to match the live $TICKER pill. Renders
 * nothing until the token is live on-chain AND the stream worker has cached a
 * market cap. Safe inside <Link>/onClick wrappers — it swallows its click and
 * routes to the token page itself.
 */
export function MarketCapChip({ tokenAddress, marketCap, ticker, compact, className }: MarketCapChipProps) {
    const router = useRouter();
    if (!tokenAddress || marketCap == null) return null;

    return (
        <button
            type="button"
            aria-label={`Token ${ticker ? `$${ticker} ` : ""}market cap ${formatMarketCap(marketCap)} — open token page`}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/${tokenAddress}`);
            }}
            className={cn(
                "flex cursor-pointer items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold leading-none tracking-tight text-white backdrop-blur-sm transition-colors hover:bg-black/70",
                className,
            )}
        >
            {!compact && ticker && <span className="max-w-24 truncate uppercase">${ticker}</span>}
            <span className="text-emerald-400 tabular-nums">{formatMarketCap(marketCap)}</span>
        </button>
    );
}
