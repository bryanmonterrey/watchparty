"use client";

import { useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { Squircle } from "@/components/ui/squircle";
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

type Timeframe = "5m" | "1h" | "6h" | "24h";

// Fixed for now — the control row that drove these is gone. The router still
// accepts sort / timeframe / chains / q, so restoring the controls is wiring
// state to these two constants, not rebuilding the query.
const TIMEFRAME: Timeframe = "24h";
const SORT = "trending" as const;

const PAGE = 50;

// One grid definition shared by the header and every row, so columns can never
// drift apart. Progressive disclosure by width rather than a horizontal
// scrollbar: the board should stay readable in a centre column, not demand the
// full viewport.
//
// CONTAINER queries, not viewport ones. This board renders inside home's centre
// column, which is narrower than the window by both rails — `lg:` there would
// measure width this component doesn't own and reveal columns that then
// overflow. The component declares its own `@container` (see the wrapper), so
// it adapts to whatever column hosts it and stays correct if it's remounted
// somewhere else.
//
// Hidden cells occupy no grid track, so the visible cell count has to match the
// track count at EVERY step — keep these in sync with the per-cell
// hidden/@block classes below.
const GRID =
    "grid items-center gap-3 " +
    // # · coin · price · change
    "grid-cols-[28px_minmax(0,1fr)_92px_76px] " +
    // + volume
    "@2xl:grid-cols-[28px_minmax(0,1fr)_92px_76px_92px] " +
    // + age, liquidity
    "@4xl:grid-cols-[28px_minmax(0,1fr)_92px_64px_76px_92px_92px] " +
    // + txns, activity
    "@6xl:grid-cols-[28px_minmax(0,1fr)_92px_64px_76px_76px_92px_92px_100px]";

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

            <span className="hidden text-right text-[13px] tabular-nums text-zinc-500 @4xl:block">{age(row.poolCreatedAt)}</span>

            <span className={cn("text-right text-[13px] font-bold tabular-nums", changeTone(pct))}>{percent(pct)}</span>

            <span className="hidden text-right text-[13px] tabular-nums text-zinc-400 @6xl:block">{compactCount(row.txns24h)}</span>

            <span className="hidden text-right text-[13px] font-semibold tabular-nums text-zinc-300 @2xl:block">{compactUsd(vol)}</span>

            <span className="hidden text-right text-[13px] tabular-nums text-zinc-400 @4xl:block">{compactUsd(row.liquidityUsd)}</span>

            <span className="hidden min-w-0 justify-end @6xl:flex">
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
            <span style={pulse} className="ml-auto hidden h-3 w-8 rounded-full shimmer-skeleton @4xl:block" />
            <span style={pulse} className="ml-auto h-3 w-12 rounded-full shimmer-skeleton" />
            <span style={pulse} className="ml-auto hidden h-3 w-10 rounded-full shimmer-skeleton @6xl:block" />
            <span style={pulse} className="ml-auto hidden h-3 w-14 rounded-full shimmer-skeleton @2xl:block" />
            <span style={pulse} className="ml-auto hidden h-3 w-14 rounded-full shimmer-skeleton @4xl:block" />
            <span style={pulse} className="ml-auto hidden h-3 w-20 rounded-full shimmer-skeleton @6xl:block" />
        </div>
    );
}

export function TrendingTable({ className }: { className?: string }) {
    // No controls for now — the board is just the table. The router still takes
    // sort / timeframe / chains / search, so bringing a control row back is
    // wiring state to these, not rebuilding the query.
    const input = useMemo(() => ({ sort: SORT, timeframe: TIMEFRAME, limit: PAGE }), []);

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
        trpc.trending.list.useInfiniteQuery(input, {
            getNextPageParam: (last) => last.nextCursor,
            // The board is refreshed by cron every few minutes; anything tighter
            // just re-renders the same rows.
            staleTime: 60_000,
            refetchInterval: 120_000,
        });

    const rows = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

    return (
        // Declares its own container so the grid measures THIS column, not the
        // viewport — home's centre column is narrower than the window by both
        // rails. Square and unpanelled: it sits directly on the column's own
        // fill rather than floating in a card.
        <div className={cn("@container", className)}>
            <div className={cn(GRID, "px-3 pb-2 pt-4 text-[12px] font-semibold text-zinc-500")}>
                <span>#</span>
                <span>coin</span>
                <span className="text-right">price</span>
                <span className="hidden text-right @4xl:block">age</span>
                <span className="text-right">{TIMEFRAME}</span>
                <span className="hidden text-right @6xl:block">txns</span>
                <span className="hidden text-right @2xl:block">volume</span>
                <span className="hidden text-right @4xl:block">liquidity</span>
                <span className="hidden text-right @6xl:block">activity</span>
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
                    <p className="text-xs text-zinc-600">the board fills as the chain sweep runs.</p>
                </div>
            ) : (
                <div>
                    {rows.map((row, i) => (
                        <TrendingRowView key={row.id} row={row} index={i} timeframe={TIMEFRAME} />
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
    );
}
