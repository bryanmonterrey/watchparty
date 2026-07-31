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
    /**
     * Token page slug: the mint address once live, else the token row id —
     * /coin/<mint> resolves both (same rule as trade's token-row).
     */
    tokenSlug: string | null | undefined;
    marketCap: number | null | undefined;
    className?: string;
}

/**
 * Market-cap pill for video surfaces (hero carousel, section cards, feed
 * cards). Price only — no ticker/title. Frosted black like the rest of the
 * over-thumbnail chrome (LIVE badge, time nail); the cap in emerald, or a
 * muted $—.—— placeholder (em dashes) until the stream worker has cached
 * one. Safe
 * inside <Link>/onClick wrappers — it swallows its click and routes to the
 * token page itself.
 */
export function MarketCapChip({ tokenSlug, marketCap, className }: MarketCapChipProps) {
    const router = useRouter();
    if (!tokenSlug) return null;

    return (
        <button
            type="button"
            aria-label={`Coin market cap ${marketCap == null ? "unavailable" : formatMarketCap(marketCap)} — open coin page`}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/coin/${tokenSlug}`);
            }}
            className={cn(
                "flex cursor-pointer items-center rounded-full bg-black/45 px-3 py-1.75 text-[13px] font-extrabold leading-none tracking-tight backdrop-blur-sm transition-colors hover:bg-black/70",
                marketCap == null ? "text-zinc-400" : "text-emerald-400",
                className,
            )}
        >
            <span className="tabular-nums">{marketCap == null ? "$—.——" : formatMarketCap(marketCap)}</span>
        </button>
    );
}
