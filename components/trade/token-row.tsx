"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Copy01Icon,
    Globe02Icon,
    Tick02Icon,
    UserGroup02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";
import { useInstantNav } from "@/hooks/use-instant-nav";
import type { TradeToken } from "./types";
import { SolanaIcon } from "../icons";

// Memescope board row — same design language as the Discover table
// (trade-discover.tsx): bonding-ring avatar, $SYMBOL + name, LIVE badge for
// streaming creators, neutral Buy pill, green/red reserved for semantics.

function formatUsd(value: number): string {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
}

function formatCount(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
}

function ringColor(progress: number, status: TradeToken["status"]): string {
    if (status === "migrated") return "#00ED89";
    if (progress >= 80) return "#FFCC00"; // sunset — close to migration
    return "#00ED89"; // lantern
}

function TokenAvatar({ token }: { token: TradeToken }) {
    const color = ringColor(token.bondingProgress, token.status);
    const size = 48;
    const stroke = 2.5;
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg className="pointer-events-none absolute inset-0 -rotate-90 size-full" viewBox={`0 0 ${size} ${size}`}>
                <rect
                    x={stroke / 2} y={stroke / 2}
                    width={size - stroke} height={size - stroke}
                    rx={14} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke}
                />
                <rect
                    x={stroke / 2} y={stroke / 2}
                    width={size - stroke} height={size - stroke}
                    rx={14} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                    pathLength="100" strokeDasharray="100"
                    strokeDashoffset={100 - (token.status === "migrated" ? 100 : token.bondingProgress)}
                    className="transition-all duration-500"
                />
            </svg>
            <div className="absolute inset-[5px] overflow-hidden rounded-[10px] bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300">
                {token.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={token.imageUrl} alt={token.symbol} className="size-full object-cover" />
                ) : (
                    null
                )}
            </div>
        </div>
    );
}

function XIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.737-8.835L1.254 2.25H8.08l4.254 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    );
}

interface TokenRowProps {
    token: TradeToken;
    /** in-row quick-buy (from useQuickBuy) — falls back to navigation without it */
    quickBuy?: (t: TradeToken) => Promise<"done" | "no-wallet" | "no-mint" | "failed">;
    buying?: boolean;
    amountSol?: number;
}

export function TokenRow({ token, quickBuy, buying = false, amountSol }: TokenRowProps) {
    const router = useRouter();
    const [copied, setCopied] = useState(false);

    // Token page resolves by tokenAddress (live) or id — either works via /coin.
    const slug = token.tokenAddress || token.id;
    // Token page is server-rendered, so warm the route's RSC payload on hover
    // intent (120ms rest, once per row — cheap even on a dense board).
    const rowPrefetch = useHoverPrefetch(() => router.prefetch(`/coin/${slug}`));
    // Mouse-only pointerdown navigation — commits the nav on press.
    const instantNav = useInstantNav(() => `/coin/${slug}`);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(token.tokenAddress || token.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    const openSocial = (e: React.MouseEvent, url?: string) => {
        e.stopPropagation();
        if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    const handleBuy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!quickBuy) {
            router.push(`/coin/${slug}`);
            return;
        }
        const result = await quickBuy(token);
        if (result === "no-mint") router.push(`/coin/${slug}`);
    };

    const up = token.changePercent >= 0;

    return (
        <div
            {...rowPrefetch}
            onPointerDown={instantNav.onPointerDown}
            onClick={() => {
                if (instantNav.consumedClick()) return;
                router.push(`/coin/${slug}`);
            }}
            className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
        >
            <TokenAvatar token={token} />

            {/* Identity */}
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-bold tracking-tight text-white">
                        {token.symbol.startsWith("$") ? token.symbol : `$${token.symbol}`}
                    </span>
                    <span className="truncate text-[13px] font-medium text-zinc-500">{token.name}</span>
                    <button onClick={handleCopy} aria-label="Copy coin address" className="shrink-0 cursor-pointer text-zinc-600 transition-colors hover:text-zinc-300">
                        {copied
                            ? <HugeiconsIcon icon={Tick02Icon} className="size-3 text-white" strokeWidth={2.5} />
                            : <HugeiconsIcon icon={Copy01Icon} className="size-3" strokeWidth={2} />}
                    </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                    {token.creatorIsLive && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/${token.creatorUsername ?? slug}`);
                            }}
                            aria-label="Watch the creator's live stream"
                            className="flex cursor-pointer items-center gap-1 rounded-full bg-pastelred/15 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-pastelred transition-colors hover:bg-pastelred/25"
                        >
                            <span className="size-1.5 animate-pulse rounded-full bg-pastelred" />
                            LIVE{token.liveViewerCount > 0 ? ` · ${formatCount(token.liveViewerCount)}` : ""}
                        </button>
                    )}
                    <span className="shrink-0 text-[12px] font-medium text-zinc-500">{token.timeAgo}</span>
                    {token.hasSocials.twitter && (
                        <button onClick={(e) => openSocial(e, token.hasSocials.twitter)} aria-label="X profile" className="cursor-pointer text-zinc-600 transition-colors hover:text-white">
                            <XIcon className="size-[11px]" />
                        </button>
                    )}
                    {token.hasSocials.website && (
                        <button onClick={(e) => openSocial(e, token.hasSocials.website)} aria-label="Website" className="cursor-pointer text-zinc-600 transition-colors hover:text-white">
                            <HugeiconsIcon icon={Globe02Icon} className="size-3" strokeWidth={2} />
                        </button>
                    )}
                    <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-zinc-500">
                        <HugeiconsIcon icon={UserGroup02Icon} className="size-[11px]" strokeWidth={2} />
                        {formatCount(token.holderCount)}
                    </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[12px] font-medium text-zinc-500">
                    <span>
                        MC <span className="font-semibold tabular-nums text-white">{formatUsd(token.marketCap)}</span>
                    </span>
                    <span className={cn("font-semibold tabular-nums", up ? "text-lantern" : "text-pastelred")}>
                        {up ? "+" : ""}{token.changePercent.toFixed(1)}%
                    </span>
                    {token.volume > 0 && (
                        <span>
                            Vol <span className="font-semibold tabular-nums text-zinc-300">{formatUsd(token.volume)}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Buy — quick-buy in place when wired, else the token page */}
            <button
                onClick={handleBuy}
                disabled={buying}
                className="flex cursor-pointer items-center gap-1.5 self-center rounded-full bg-white/10 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-default"
            >
                <SolanaIcon className="size-3.5" />
                {buying ? "Buying…" : quickBuy && amountSol ? `Buy ${amountSol}` : "Buy"}
            </button>
        </div>
    );
}
