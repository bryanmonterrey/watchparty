"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Copy01Icon,
    Globe02Icon,
    Tick02Icon,
    UserGroup02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { getRealtimeClient, authenticateRealtimeClient } from "@/lib/supabase/realtime-client";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { Squircle } from "@/components/ui/squircle";
import { SolanaIcon } from "@/components/icons";
import type { TokenStatus, TradeToken } from "./types";

// Discover: the /trade landing (per the Axiom reference, in watchparty's
// language) — tab pills + sort over ONE full-width token table. Tabs are
// discovery *views* (Trending / Live / Top / New) — lifecycle stages
// (new/migrating/migrated) live on /trade/memescope as columns. "Live" is
// tokens whose creator is streaming on watchparty right now — the native
// counterpart of Axiom's "Pump Live". Every number shown is a real cached
// market column; nothing decorative. The bonding ring around each token image
// carries migration progress, so there's no separate progress column.

const EMPTY: Record<TokenStatus, TradeToken[]> = { new: [], migrating: [], migrated: [] };

type Tab = "trending" | "live" | "top" | "new";

const TABS: { key: Tab; label: string }[] = [
    { key: "trending", label: "Trending" },
    { key: "live", label: "Live" },
    { key: "top", label: "Top" },
    { key: "new", label: "New" },
];

type SortKey = "volume" | "marketCap" | "txCount" | "newest";

// Each tab's natural ordering; the sort dropdown can override it afterwards.
const TAB_SORT: Record<Tab, SortKey> = {
    trending: "volume",
    live: "volume",
    top: "marketCap",
    new: "newest",
};

const EMPTY_COPY: Record<Tab, { title: string; hint: string }> = {
    trending: { title: "No tokens here yet", hint: "New launches show up the moment they go live." },
    live: { title: "No creators live right now", hint: "Tokens appear here while their creator is streaming." },
    top: { title: "No tokens here yet", hint: "New launches show up the moment they go live." },
    new: { title: "No fresh launches yet", hint: "Brand-new tokens land here first." },
};

const SORTS: { key: SortKey; label: string }[] = [
    { key: "volume", label: "Volume" },
    { key: "marketCap", label: "Market cap" },
    { key: "txCount", label: "Transactions" },
    { key: "newest", label: "Newest" },
];

function formatUsd(value: number): string {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
}

function formatPrice(value: number): string {
    if (value === 0) return "—";
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.001) return `$${value.toFixed(4)}`;
    // sub-milli prices: show leading-zero count notation ($0.0₅123)
    const s = value.toFixed(12);
    const m = s.match(/^0\.(0*)(\d{1,3})/);
    if (!m) return `$${value.toPrecision(2)}`;
    return `$0.0${String.fromCharCode(0x2080 + m[1].length)}${m[2]}`;
}

function formatCount(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
}

function ringColor(progress: number, status: TokenStatus): string {
    if (status === "migrated") return "#00ED89";
    if (progress >= 80) return "#FFCC00"; // sunset — close to migration
    return "#00ED89"; // lantern
}

// public/menu2.svg inlined so it rides currentColor.
function Menu2Icon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M4 8.5L20 8.5" />
            <path d="M4 15.5L20 15.5" />
        </svg>
    );
}

function XIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.737-8.835L1.254 2.25H8.08l4.254 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    );
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
                    token.symbol.replace(/^\$/, "").slice(0, 2).toUpperCase()
                )}
            </div>
        </div>
    );
}

// Shared grid template so the header row and token rows stay aligned.
const GRID = "grid grid-cols-[minmax(220px,1.5fr)_minmax(96px,1fr)_minmax(88px,1fr)_minmax(88px,1fr)_minmax(72px,0.8fr)_minmax(96px,auto)] max-lg:grid-cols-[minmax(200px,1.6fr)_minmax(96px,1fr)_minmax(88px,1fr)_minmax(96px,auto)] max-md:grid-cols-[minmax(0,1.6fr)_minmax(90px,1fr)_minmax(84px,auto)] items-center gap-3";

function DiscoverRow({ token }: { token: TradeToken }) {
    const router = useRouter();
    const [copied, setCopied] = useState(false);
    const slug = token.tokenAddress || token.id;

    const copy = (e: React.MouseEvent) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(token.tokenAddress || token.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    const openSocial = (e: React.MouseEvent, url?: string) => {
        e.stopPropagation();
        if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    const up = token.changePercent >= 0;

    return (
        <div
            onClick={() => router.push(`/${slug}`)}
            className={cn(GRID, "cursor-pointer px-4 py-3 transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]")}
        >
            {/* Pair */}
            <div className="flex min-w-0 items-center gap-3">
                <TokenAvatar token={token} />
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-[16px] font-bold tracking-tight text-white">
                            {token.symbol.startsWith("$") ? token.symbol : `$${token.symbol}`}
                        </span>
                        <span className="hidden truncate text-[14px] font-medium text-zinc-500 sm:inline">{token.name}</span>
                        <button onClick={copy} aria-label="Copy token address" className="shrink-0 cursor-pointer text-zinc-600 transition-colors hover:text-zinc-300">
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
                        <span className="text-[12px] font-medium text-zinc-500">{token.timeAgo}</span>
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
                        <span className="flex items-center gap-1 text-[12px] font-medium text-zinc-500 md:hidden">
                            <HugeiconsIcon icon={UserGroup02Icon} className="size-[11px]" strokeWidth={2} />
                            {formatCount(token.holderCount)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Market cap + 24h change */}
            <div className="min-w-0">
                <p className="text-[15px] font-bold tabular-nums tracking-tight text-white">{formatUsd(token.marketCap)}</p>
                <p className={cn("mt-0.5 text-[13px] font-semibold tabular-nums", up ? "text-lantern" : "text-pastelred")}>
                    {up ? "+" : ""}{token.changePercent.toFixed(1)}%
                </p>
            </div>

            {/* Volume 24h */}
            <div className="min-w-0 max-md:hidden">
                <p className="text-[15px] font-semibold tabular-nums text-zinc-200">{token.volume > 0 ? formatUsd(token.volume) : "—"}</p>
                <p className="mt-0.5 text-[12px] font-medium text-zinc-600">24h vol</p>
            </div>

            {/* Price */}
            <div className="min-w-0 max-lg:hidden">
                <p className="text-[15px] font-semibold tabular-nums text-zinc-200">{formatPrice(token.priceUsd)}</p>
                <p className="mt-0.5 text-[12px] font-medium text-zinc-600">price</p>
            </div>

            {/* TX + holders */}
            <div className="min-w-0 max-lg:hidden">
                <p className="text-[15px] font-semibold tabular-nums text-zinc-200">{formatCount(token.txCount)}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-zinc-600">
                    <HugeiconsIcon icon={UserGroup02Icon} className="size-[11px]" strokeWidth={2} />
                    {formatCount(token.holderCount)}
                </p>
            </div>

            {/* Buy */}
            <div className="flex justify-end">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/${slug}`);
                    }}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-[14px] font-bold text-white transition-colors hover:bg-white/20 active:scale-95"
                >
                    <SolanaIcon className="size-3.5" />
                    Buy
                </button>
            </div>
        </div>
    );
}

function RowSkeleton() {
    return (
        <div className={cn(GRID, "px-4 py-3")}>
            <div className="flex items-center gap-3">
                <div className="size-12 shrink-0 overflow-hidden rounded-[14px]"><div className="size-full shimmer-skeleton" /></div>
                <div className="flex w-full max-w-[160px] flex-col gap-2">
                    <div className="h-3.5 w-2/3 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                    <div className="h-2.5 w-1/2 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                </div>
            </div>
            <div className="h-3.5 w-14 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
            <div className="h-3.5 w-14 overflow-hidden rounded-full max-md:hidden"><div className="size-full shimmer-skeleton" /></div>
            <div className="h-3.5 w-14 overflow-hidden rounded-full max-lg:hidden"><div className="size-full shimmer-skeleton" /></div>
            <div className="h-3.5 w-10 overflow-hidden rounded-full max-lg:hidden"><div className="size-full shimmer-skeleton" /></div>
            <div className="flex justify-end"><div className="h-9 w-[76px] overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div></div>
        </div>
    );
}

export function TradeDiscover() {
    const [tab, setTab] = useState<Tab>("trending");
    const [sort, setSort] = useState<SortKey>("volume");
    const utils = trpc.useUtils();

    const { data = EMPTY, isLoading } = trpc.trade.getFeed.useQuery(undefined, {
        refetchInterval: 15_000,
        refetchOnWindowFocus: true,
    });

    // Same realtime push as the memescope board: token-stream worker writes →
    // Postgres change → invalidate. `streams` is watched too so the Live tab
    // reacts the moment a creator goes live/offline. Anon users ride the 15s
    // refetch.
    useEffect(() => {
        let channel: ReturnType<ReturnType<typeof getRealtimeClient>["channel"]> | null = null;
        let cancelled = false;
        (async () => {
            const client = getRealtimeClient();
            try {
                await authenticateRealtimeClient();
            } catch {
                return;
            }
            if (cancelled) return;
            channel = client
                .channel("trade:tokens")
                .on("postgres_changes", { event: "*", schema: "public", table: "tokens" }, () =>
                    utils.trade.getFeed.invalidate(),
                )
                .on("postgres_changes", { event: "*", schema: "public", table: "streams" }, () =>
                    utils.trade.getFeed.invalidate(),
                )
                .subscribe();
        })();
        return () => {
            cancelled = true;
            if (channel) getRealtimeClient().removeChannel(channel);
        };
    }, [utils]);

    const all = useMemo(
        () => [...data.new, ...data.migrating, ...data.migrated],
        [data],
    );
    const liveCount = all.filter((t) => t.creatorIsLive).length;

    const tokens = useMemo(() => {
        const base =
            tab === "live" ? all.filter((t) => t.creatorIsLive)
            : tab === "new" ? [...data.new]
            : [...all];
        const by: Record<SortKey, (a: TradeToken, b: TradeToken) => number> = {
            volume: (a, b) => b.volume - a.volume,
            marketCap: (a, b) => b.marketCap - a.marketCap,
            txCount: (a, b) => b.txCount - a.txCount,
            // getFeed already returns each column newest/most-progressed first;
            // "newest" keeps the natural order.
            newest: () => 0,
        };
        // Live tab: most-watched streams first, market sort as tiebreaker.
        return base.sort((a, b) =>
            tab === "live" ? b.liveViewerCount - a.liveViewerCount || by[sort](a, b) : by[sort](a, b),
        );
    }, [data, all, tab, sort]);

    const selectTab = (t: Tab) => {
        setTab(t);
        setSort(TAB_SORT[t]);
    };

    return (
        <div className="flex h-full flex-col">
            {/* Glass control bar under the fixed header (same pattern as the
                memescope board's sticky header). */}
            <div className="sticky top-0 z-40">
                <div className="pointer-events-none absolute inset-0 -z-10 bg-black/20 backdrop-blur-sm" />
                <div className="h-(--header-height) max-md:hidden" />
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-2 lg:px-6">
                    <div className="flex items-center gap-1.5">
                        {TABS.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => selectTab(t.key)}
                                className={cn(
                                    "flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-bold tracking-tight transition-colors",
                                    tab === t.key
                                        ? "bg-white text-black"
                                        : "text-zinc-400 hover:bg-white/10 hover:text-white",
                                )}
                            >
                                {t.key === "live" && liveCount > 0 && (
                                    <span className="relative flex size-2">
                                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-pastelred opacity-75" />
                                        <span className="relative inline-flex size-2 rounded-full bg-pastelred" />
                                    </span>
                                )}
                                {t.label}
                                {t.key === "live" && liveCount > 0 && (
                                    <span className={cn("text-[13px] font-bold tabular-nums", tab === t.key ? "text-black/50" : "text-zinc-600")}>
                                        {liveCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <GooDropdown
                        align="end"
                        width={192}
                        gap={8}
                        fill="#101011"
                        panelRadius={20}
                        itemHeight={40}
                        triggerAriaLabel="Sort tokens"
                        triggerClassName="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-white/5 px-4 text-sm font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                        trigger={
                            <>
                                <Menu2Icon className="size-4" />
                                {SORTS.find((s) => s.key === sort)?.label}
                            </>
                        }
                        items={SORTS.map((s) => ({
                            key: s.key,
                            onClick: () => setSort(s.key),
                            className: "justify-between px-3 rounded-full cursor-pointer text-sm font-semibold text-zinc-300 hover:bg-white/5 hover:text-white",
                            label: (
                                <>
                                    {s.label}
                                    {sort === s.key && <HugeiconsIcon icon={Tick02Icon} className="size-4 text-white" strokeWidth={2} />}
                                </>
                            ),
                        }))}
                    />
                </div>
            </div>

            {/* Token table */}
            <div className="flex-1 px-4 pb-8 lg:px-6">
                <Squircle asChild radius={24} autoEffects={false}>
                    <div className="bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
                        {/* Column headers */}
                        <div className={cn(GRID, "px-4 pb-2 pt-4 text-[13px] font-semibold text-zinc-500")}>
                            <span>Token</span>
                            <span>Market cap</span>
                            <span className="max-md:hidden">Volume</span>
                            <span className="max-lg:hidden">Price</span>
                            <span className="max-lg:hidden">Txns</span>
                            <span className="text-right">Action</span>
                        </div>

                        <div>
                            {isLoading ? (
                                Array.from({ length: 10 }).map((_, i) => <RowSkeleton key={i} />)
                            ) : tokens.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-1 py-20">
                                    <p className="text-sm font-bold text-zinc-400">{EMPTY_COPY[tab].title}</p>
                                    <p className="text-xs text-zinc-600">{EMPTY_COPY[tab].hint}</p>
                                </div>
                            ) : (
                                tokens.map((t) => <DiscoverRow key={t.id} token={t} />)
                            )}
                        </div>
                    </div>
                </Squircle>
            </div>
        </div>
    );
}
