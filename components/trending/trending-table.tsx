"use client";

import { useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    ArrowDown01Icon,
    MenuTwoLineIcon,
    Search01Icon,
    Tick02Icon,
    FireIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { Squircle } from "@/components/ui/squircle";
import { GooDropdown, gooMenuItem, GOO_TRIGGER_PILL, GOO_PANEL_FILL } from "@/components/ui/goo-dropdown";
import { staggerPulse } from "@/lib/skeleton-stagger";
import { explorerUrl } from "@/lib/coin-feed/networks";
import type { AppRouter } from "@/server/routers";
import { ChainBadge } from "./chain-badge";
import { age, changeTone, compactCount, compactUsd, percent, tokenPrice } from "./trending-format";

// The trending board — every-chain coin table behind /trending.
//
// Self-contained on purpose: it takes no props beyond presentation, owns its
// own queries and filter state, and renders into whatever column it's given.
// Mounting it somewhere else (the /trade landing, a dashboard panel) is an
// import, not a refactor.
//
// Reads the trending_coins cache only, so a page load costs zero external API
// calls regardless of traffic — the GeckoTerminal sweep happens in the cron.

type RouterOutput = inferRouterOutputs<AppRouter>;
type TrendingRow = RouterOutput["trending"]["list"]["items"][number];

const TIMEFRAMES = ["5m", "1h", "6h", "24h"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

type SortKey = "trending" | "volume" | "marketCap" | "liquidity" | "gainers" | "losers" | "new" | "txns";

const SORTS: { key: SortKey; label: string }[] = [
    { key: "trending", label: "trending" },
    { key: "volume", label: "volume" },
    { key: "marketCap", label: "market cap" },
    { key: "liquidity", label: "liquidity" },
    { key: "gainers", label: "top gainers" },
    { key: "losers", label: "top losers" },
    { key: "new", label: "newest" },
    { key: "txns", label: "transactions" },
];

const PAGE = 50;

// One grid definition shared by the header and every row, so columns can never
// drift apart. Progressive disclosure by width rather than a horizontal
// scrollbar: the board should stay readable in a centre column, not demand the
// full viewport.
const GRID =
    "grid items-center gap-3 " +
    "grid-cols-[28px_minmax(0,1fr)_92px_76px] " +
    "md:grid-cols-[28px_minmax(0,1fr)_92px_76px_92px] " +
    "lg:grid-cols-[28px_minmax(0,1fr)_92px_64px_76px_92px_92px] " +
    "xl:grid-cols-[28px_minmax(0,1fr)_92px_64px_76px_76px_92px_92px_100px]";

function pctFor(row: TrendingRow, tf: Timeframe): number | null {
    return tf === "5m" ? row.priceChange5m : tf === "1h" ? row.priceChange1h : tf === "6h" ? row.priceChange6h : row.priceChange24h;
}

function volFor(row: TrendingRow, tf: Timeframe): number | null {
    return tf === "5m" ? row.volume5mUsd : tf === "1h" ? row.volume1hUsd : tf === "6h" ? row.volume6hUsd : row.volume24hUsd;
}

/** The row's live-activity cell — the thing a plain price table can't show.
 *  Reads the most recent trader cluster on this coin from the alert feed. */
function ActivityCell({ activity }: { activity: TrendingRow["activity"] }) {
    if (!activity) return <span className="text-[13px] text-zinc-700">—</span>;
    const buying = activity.kind.endsWith("_buy");
    const whale = activity.kind.startsWith("whale");
    return (
        <span className="flex min-w-0 flex-col leading-tight">
            <span className={cn("truncate text-[13px] font-bold", buying ? "text-jewel" : "text-pastelred")}>
                {whale ? "whale" : `${activity.traderCount ?? 0} traders`} {buying ? "bought" : "sold"}
            </span>
            <span className="truncate text-[11px] text-zinc-600">
                {compactUsd(activity.usdValue)} · {age(activity.occurredAt)} ago
            </span>
        </span>
    );
}

function TrendingRowView({ row, index, timeframe }: { row: TrendingRow; index: number; timeframe: Timeframe }) {
    const pct = pctFor(row, timeframe);
    const vol = volFor(row, timeframe);
    // These are markets we track, not coins we host, so a row links out to the
    // chain's explorer (GeckoTerminal's pool page for chains we haven't mapped).
    const explorer = explorerUrl(row.network, row.tokenAddress, row.poolAddress);

    const body = (
        <div className={cn(GRID, "px-3 py-2.5")}>
            <span className="text-[13px] font-bold tabular-nums text-zinc-600">{index + 1}</span>

            <span className="flex min-w-0 items-center gap-2.5">
                {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.imageUrl} alt="" loading="lazy" className="size-8 shrink-0 rounded-full object-cover" />
                ) : (
                    <span className="size-8 shrink-0 rounded-full bg-white/[0.06]" />
                )}
                <span className="flex min-w-0 flex-col leading-tight">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[14px] font-extrabold text-white">{row.symbol}</span>
                        <ChainBadge network={row.network} />
                    </span>
                    <span className="truncate text-[12px] text-zinc-500">{row.name ?? row.dexId ?? ""}</span>
                </span>
            </span>

            <span className="text-right text-[13px] font-bold tabular-nums text-white">{tokenPrice(row.priceUsd)}</span>

            <span className="hidden text-right text-[13px] tabular-nums text-zinc-500 lg:block">{age(row.poolCreatedAt)}</span>

            <span className={cn("text-right text-[13px] font-bold tabular-nums", changeTone(pct))}>{percent(pct)}</span>

            <span className="hidden text-right text-[13px] tabular-nums text-zinc-400 xl:block">{compactCount(row.txns24h)}</span>

            <span className="hidden text-right text-[13px] font-semibold tabular-nums text-zinc-300 md:block">{compactUsd(vol)}</span>

            <span className="hidden text-right text-[13px] tabular-nums text-zinc-400 lg:block">{compactUsd(row.liquidityUsd)}</span>

            <span className="hidden min-w-0 justify-end xl:flex">
                <ActivityCell activity={row.activity} />
            </span>
        </div>
    );

    if (!explorer) {
        return (
            <Squircle asChild radius={12} autoEffects={false}>
                <div className="transition-colors hover:bg-white/[0.03]">{body}</div>
            </Squircle>
        );
    }

    return (
        <Squircle asChild radius={12} autoEffects={false}>
            <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="block cursor-pointer transition-colors hover:bg-white/[0.03]"
            >
                {body}
            </a>
        </Squircle>
    );
}

function RowSkeleton({ index, count }: { index: number; count: number }) {
    const pulse = staggerPulse(index, count);
    return (
        <div className={cn(GRID, "px-3 py-2.5")}>
            <span style={pulse} className="h-3 w-4 rounded-full shimmer-skeleton" />
            <span className="flex min-w-0 items-center gap-2.5">
                <span style={pulse} className="size-8 shrink-0 rounded-full shimmer-skeleton" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span style={pulse} className="h-3 w-24 rounded-full shimmer-skeleton" />
                    <span style={pulse} className="h-2.5 w-16 rounded-full shimmer-skeleton" />
                </span>
            </span>
            <span style={pulse} className="ml-auto h-3 w-14 rounded-full shimmer-skeleton" />
            <span style={pulse} className="ml-auto hidden h-3 w-8 rounded-full shimmer-skeleton lg:block" />
            <span style={pulse} className="ml-auto h-3 w-12 rounded-full shimmer-skeleton" />
            <span style={pulse} className="ml-auto hidden h-3 w-10 rounded-full shimmer-skeleton xl:block" />
            <span style={pulse} className="ml-auto hidden h-3 w-14 rounded-full shimmer-skeleton md:block" />
            <span style={pulse} className="ml-auto hidden h-3 w-14 rounded-full shimmer-skeleton lg:block" />
            <span style={pulse} className="ml-auto hidden h-3 w-20 rounded-full shimmer-skeleton xl:block" />
        </div>
    );
}

export function TrendingTable({ className }: { className?: string }) {
    const [sort, setSort] = useState<SortKey>("trending");
    const [timeframe, setTimeframe] = useState<Timeframe>("24h");
    const [chains, setChains] = useState<string[] | null>(null); // null = every chain
    const [search, setSearch] = useState("");
    const [q, setQ] = useState("");

    // Debounced so typing doesn't fire a query per keystroke.
    useEffect(() => {
        const t = setTimeout(() => setQ(search.trim()), 250);
        return () => clearTimeout(t);
    }, [search]);

    const { data: chainRows } = trpc.trending.chains.useQuery(undefined, { staleTime: 300_000 });
    const { data: stats } = trpc.trending.stats.useQuery(undefined, { staleTime: 60_000, refetchInterval: 120_000 });

    const input = useMemo(
        () => ({
            sort,
            timeframe,
            limit: PAGE,
            ...(chains?.length ? { chains } : {}),
            ...(q ? { q } : {}),
        }),
        [sort, timeframe, chains, q],
    );

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
        trpc.trending.list.useInfiniteQuery(input, {
            getNextPageParam: (last) => last.nextCursor,
            // The board is refreshed by cron every few minutes; anything tighter
            // just re-renders the same rows.
            staleTime: 60_000,
            refetchInterval: 120_000,
        });

    const rows = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

    const toggleChain = (id: string) => {
        const all = (chainRows ?? []).map((c) => c.network);
        const current = chains ?? all;
        const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
        setChains(next.length === 0 || next.length === all.length ? null : next);
    };

    const check = (on: boolean) =>
        on ? <HugeiconsIcon icon={Tick02Icon} className="size-4 text-white" strokeWidth={2} /> : undefined;

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            {/* Summary strip — the "overall atmosphere" read, before any row. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
                <span className="flex items-center gap-2">
                    <HugeiconsIcon icon={FireIcon} className="size-5 text-white" strokeWidth={2} />
                    <h1 className="text-2xl font-semibold tracking-tight text-white">trending</h1>
                </span>
                {stats && stats.coins > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                        <span className="text-zinc-500">
                            <span className="font-bold tabular-nums text-zinc-300">{stats.coins}</span> coins
                        </span>
                        <span className="text-zinc-500">
                            <span className="font-bold tabular-nums text-zinc-300">{stats.chains}</span> chains
                        </span>
                        <span className="text-zinc-500">
                            <span className="font-bold tabular-nums text-zinc-300">{compactUsd(stats.volume24hUsd)}</span> 24h vol
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="font-bold tabular-nums text-jewel">{stats.gainers}</span>
                            <span className="text-zinc-700">/</span>
                            <span className="font-bold tabular-nums text-pastelred">{stats.losers}</span>
                        </span>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 px-1">
                <label className="relative flex h-11 min-w-0 flex-1 items-center sm:max-w-[280px]">
                    <HugeiconsIcon
                        icon={Search01Icon}
                        className="pointer-events-none absolute left-3.5 size-4 text-zinc-500"
                        strokeWidth={2}
                    />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="search coins"
                        aria-label="search coins"
                        className="h-11 w-full rounded-full bg-white/5 pl-10 pr-4 text-sm font-semibold text-white ring-1 ring-white/10 outline-none placeholder:text-zinc-600 focus:ring-white/20"
                    />
                </label>

                {/* Timeframe drives the % and volume columns together. */}
                <div className="flex h-11 items-center rounded-full bg-white/5 p-1">
                    {TIMEFRAMES.map((tf) => (
                        <button
                            key={tf}
                            type="button"
                            onClick={() => setTimeframe(tf)}
                            className={cn(
                                "h-9 cursor-pointer rounded-full px-3 text-[13px] font-bold transition-colors",
                                timeframe === tf ? "bg-white text-black" : "text-zinc-400 hover:text-white",
                            )}
                        >
                            {tf}
                        </button>
                    ))}
                </div>

                <GooDropdown
                    align="end"
                    width={220}
                    gap={8}
                    fill={GOO_PANEL_FILL}
                    triggerAriaLabel="sort coins"
                    triggerClassName={GOO_TRIGGER_PILL}
                    trigger={
                        <>
                            <HugeiconsIcon icon={MenuTwoLineIcon} className="size-4" strokeWidth={2} />
                            {SORTS.find((s) => s.key === sort)?.label}
                            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
                        </>
                    }
                    items={SORTS.map((s) =>
                        gooMenuItem({ key: s.key, label: s.label, onClick: () => setSort(s.key), right: check(sort === s.key) }),
                    )}
                />

                <GooDropdown
                    align="end"
                    width={220}
                    gap={8}
                    fill={GOO_PANEL_FILL}
                    maxPanelHeight={420}
                    triggerAriaLabel="filter chains"
                    triggerClassName={GOO_TRIGGER_PILL}
                    trigger={
                        <>
                            {chains?.length ? `${chains.length} chains` : "all chains"}
                            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
                        </>
                    }
                    items={[
                        gooMenuItem({
                            key: "all",
                            label: "all chains",
                            closeOnSelect: false,
                            onClick: () => setChains(null),
                            right: check(!chains?.length),
                        }),
                        { type: "separator" as const },
                        ...(chainRows ?? []).map((c) =>
                            gooMenuItem({
                                key: c.network,
                                label: <ChainBadge network={c.network} />,
                                closeOnSelect: false,
                                onClick: () => toggleChain(c.network),
                                right: (
                                    <span className="flex items-center gap-2">
                                        <span className="text-[13px] font-semibold tabular-nums text-zinc-500">{c.coins}</span>
                                        {check(!chains || chains.includes(c.network))}
                                    </span>
                                ),
                            }),
                        ),
                    ]}
                />
            </div>

            {/* Table */}
            <Squircle asChild radius={24} autoEffects={false}>
                <div className="bg-panel">
                    <div className={cn(GRID, "px-3 pb-2 pt-4 text-[12px] font-semibold text-zinc-500")}>
                        <span>#</span>
                        <span>coin</span>
                        <span className="text-right">price</span>
                        <span className="hidden text-right lg:block">age</span>
                        <span className="text-right">{timeframe}</span>
                        <span className="hidden text-right xl:block">txns</span>
                        <span className="hidden text-right md:block">volume</span>
                        <span className="hidden text-right lg:block">liquidity</span>
                        <span className="hidden text-right xl:block">activity</span>
                    </div>

                    {isError ? (
                        <p className="py-16 text-center text-sm text-zinc-500">couldn&apos;t load the board.</p>
                    ) : isLoading ? (
                        <div>
                            {Array.from({ length: 12 }).map((_, i) => (
                                <RowSkeleton key={i} index={i} count={12} />
                            ))}
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="flex flex-col items-center gap-1 py-16">
                            <p className="text-sm font-bold text-zinc-400">nothing here yet</p>
                            <p className="text-xs text-zinc-600">
                                {q || chains?.length ? "no coins match these filters." : "the board fills as the chain sweep runs."}
                            </p>
                        </div>
                    ) : (
                        <div>
                            {rows.map((row, i) => (
                                <TrendingRowView key={row.id} row={row} index={i} timeframe={timeframe} />
                            ))}
                        </div>
                    )}

                    {hasNextPage && rows.length > 0 && (
                        <div className="flex justify-center px-3 py-4">
                            <button
                                type="button"
                                onClick={() => void fetchNextPage()}
                                disabled={isFetchingNextPage}
                                className="h-11 cursor-pointer rounded-full bg-white/5 px-5 text-sm font-bold text-zinc-200 ring-1 ring-white/10 transition-colors hover:text-white disabled:opacity-50"
                            >
                                {isFetchingNextPage ? "loading…" : "load more"}
                            </button>
                        </div>
                    )}
                </div>
            </Squircle>
        </div>
    );
}
