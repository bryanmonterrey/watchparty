"use client";

import { useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDownRight01Icon, ArrowUpRight01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { useQuickBuy } from "@/hooks/use-quick-buy";
import { staggerPulse } from "@/lib/skeleton-stagger";
import { explorerUrl, tradeUrl, trackedTokenId } from "@/lib/coin-feed/networks";
import type { AppRouter } from "@/server/routers";
import { ChainBadge } from "./chain-badge";
import { useStar } from "./use-starred";
import { changeTone, compactUsd, percentAbs, tokenPrice } from "./trending-format";

// The trending board — every-chain coin table behind /trending.
//
// Self-contained on purpose: it takes no props beyond presentation, owns its
// own queries and filter state, and renders into whatever column it's given.
// Mounting it somewhere else (the /trade landing, a dashboard panel) is an
// import, not a refactor.
//
// Reads the trending_coins cache only, so a page load costs zero external API
// calls regardless of traffic — the GeckoTerminal sweep happens in the cron.
//
// SHAPE: name / market price / volume / market cap / change / buy / star, per
// the market-table format the author specced. The board used to carry rank,
// age, txns, liquidity and a live-activity cell too; those came out with the
// reformat. The router still returns every one of them (`activity` included),
// so bringing one back is a cell plus a grid track, not a query change.

type RouterOutput = inferRouterOutputs<AppRouter>;
type TrendingRow = RouterOutput["trending"]["list"]["items"][number];
type QuickBuy = ReturnType<typeof useQuickBuy>["quickBuy"];

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
// The two optional columns come in EARLY (@xl = 36rem, @3xl = 48rem) rather
// than at the old @2xl/@4xl: home's centre column is ~800px on a laptop, and
// the point of the format is that market cap and volume are visible, not that
// they exist at ultrawide.
//
// Hidden cells occupy no grid track, so the visible cell count has to match the
// track count at EVERY step — keep these in sync with the per-cell
// hidden/@block classes below.
const GRID =
    "grid items-center gap-x-4 " +
    // coin · price · change · buy · star
    "grid-cols-[minmax(0,1fr)_92px_76px_44px_24px] " +
    // + volume
    "@xl:grid-cols-[minmax(0,1fr)_104px_96px_84px_48px_26px] " +
    // + market cap
    "@3xl:grid-cols-[minmax(0,1fr)_112px_100px_104px_88px_52px_28px]";

function pctFor(row: TrendingRow, tf: Timeframe): number | null {
    return tf === "5m" ? row.priceChange5m : tf === "1h" ? row.priceChange1h : tf === "6h" ? row.priceChange6h : row.priceChange24h;
}

function volFor(row: TrendingRow, tf: Timeframe): number | null {
    return tf === "5m" ? row.volume5mUsd : tf === "1h" ? row.volume1hUsd : tf === "6h" ? row.volume6hUsd : row.volume24hUsd;
}

/** Direction arrow + magnitude. The arrow is what carries the sign, so the
 *  cell reads correctly for anyone who can't separate the red from the green. */
function ChangeCell({ pct }: { pct: number | null }) {
    const known = pct != null && Number.isFinite(pct) && pct !== 0;
    return (
        <span className={cn("flex items-center gap-1 text-[14px] font-bold tabular-nums", changeTone(pct))}>
            {known && (
                <HugeiconsIcon
                    icon={pct > 0 ? ArrowUpRight01Icon : ArrowDownRight01Icon}
                    className="size-4 shrink-0"
                    strokeWidth={2.5}
                />
            )}
            {percentAbs(pct)}
        </span>
    );
}

/** Buy, for real: Solana routes through the in-app quick-buy (Jupiter quote →
 *  the wallet's swap engine, same as the /trade board), every other chain opens
 *  the pool's venue. A row we can't actually fill would be worse than no cell. */
function BuyCell({ row, quickBuy, buying }: { row: TrendingRow; quickBuy: QuickBuy; buying: boolean }) {
    const shared = "text-[14px] font-bold text-royal-blue transition-opacity hover:opacity-80";

    if (row.network === "solana") {
        return (
            <button
                type="button"
                // relative z-10 clears the name cell's stretched link, which
                // covers the whole row.
                className={cn(shared, "relative z-10 w-fit cursor-pointer disabled:opacity-50")}
                disabled={buying}
                onClick={() => {
                    void quickBuy({
                        id: row.id,
                        tokenAddress: row.tokenAddress,
                        symbol: row.symbol,
                        imageUrl: row.imageUrl,
                    });
                }}
            >
                {buying ? "buying…" : "buy"}
            </button>
        );
    }

    return (
        <a
            href={tradeUrl(row.network, row.tokenAddress, row.poolAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(shared, "relative z-10 w-fit")}
        >
            buy
        </a>
    );
}

function StarCell({ row }: { row: TrendingRow }) {
    const { starred, toggle } = useStar(trackedTokenId(row.network, row.tokenAddress));
    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={starred}
            aria-label={starred ? "unstar coin" : "star coin"}
            className={cn(
                "relative z-10 flex cursor-pointer items-center transition-colors",
                // HugeIcons paths ship fill="none"; a CSS fill outranks a
                // presentation attribute, so this is what fills the star.
                starred ? "text-pastel-yellow [&_path]:fill-current" : "text-zinc-600 hover:text-zinc-300",
            )}
        >
            <HugeiconsIcon icon={StarIcon} className="size-[18px]" strokeWidth={2} />
        </button>
    );
}

function TrendingRowView({ row, timeframe, quickBuy, buying }: {
    row: TrendingRow;
    timeframe: Timeframe;
    quickBuy: QuickBuy;
    buying: boolean;
}) {
    // These are markets we track, not coins we host, so the coin's name links
    // out to the chain's explorer (GeckoTerminal's pool page for chains we
    // haven't mapped).
    const explorer = explorerUrl(row.network, row.tokenAddress, row.poolAddress);
    const title = row.name ?? row.symbol;

    return (
        // `relative` anchors the stretched link below; the row is a div, not an
        // anchor, because buy and star are interactive and nesting those inside
        // an <a> is invalid.
        <div className={cn(GRID, "group relative border-b border-white/5 px-3 py-3.5 transition-colors hover:bg-white/[0.03]")}>
            <span className="flex min-w-0 items-center gap-3">
                {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.imageUrl} alt="" loading="lazy" className="size-9 shrink-0 rounded-full object-cover" />
                ) : (
                    <span className="size-9 shrink-0 rounded-full bg-white/[0.06]" />
                )}
                <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
                    {explorer ? (
                        <a
                            href={explorer}
                            target="_blank"
                            rel="noopener noreferrer"
                            // after:inset-0 stretches this one link over the
                            // whole row, so the row is clickable without the
                            // markup being an anchor.
                            className="truncate text-[15px] font-bold text-white after:absolute after:inset-0 after:content-['']"
                        >
                            {title}
                        </a>
                    ) : (
                        <span className="truncate text-[15px] font-bold text-white">{title}</span>
                    )}
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] text-zinc-500">{row.symbol}</span>
                        <ChainBadge network={row.network} />
                    </span>
                </span>
            </span>

            <span className="text-[14px] font-bold tabular-nums text-white">{tokenPrice(row.priceUsd)}</span>

            <span className="hidden text-[14px] font-semibold tabular-nums text-zinc-300 @xl:block">
                {compactUsd(volFor(row, timeframe))}
            </span>

            <span className="hidden text-[14px] font-semibold tabular-nums text-zinc-300 @3xl:block">
                {compactUsd(row.marketCapUsd)}
            </span>

            <ChangeCell pct={pctFor(row, timeframe)} />

            <BuyCell row={row} quickBuy={quickBuy} buying={buying} />

            <StarCell row={row} />
        </div>
    );
}

function RowSkeleton({ index, count }: { index: number; count: number }) {
    const pulse = staggerPulse(index, count);
    return (
        <div className={cn(GRID, "border-b border-white/5 px-3 py-3.5")}>
            <span className="flex min-w-0 items-center gap-3">
                <span style={pulse} className="size-9 shrink-0 rounded-full shimmer-skeleton" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span style={pulse} className="h-3.5 w-28 rounded-full shimmer-skeleton" />
                    <span style={pulse} className="h-2.5 w-16 rounded-full shimmer-skeleton" />
                </span>
            </span>
            <span style={pulse} className="h-3 w-16 rounded-full shimmer-skeleton" />
            <span style={pulse} className="hidden h-3 w-14 rounded-full shimmer-skeleton @xl:block" />
            <span style={pulse} className="hidden h-3 w-14 rounded-full shimmer-skeleton @3xl:block" />
            <span style={pulse} className="h-3 w-12 rounded-full shimmer-skeleton" />
            <span style={pulse} className="h-3 w-8 rounded-full shimmer-skeleton" />
            <span style={pulse} className="size-4 rounded-full shimmer-skeleton" />
        </div>
    );
}

export function TrendingTable({ className }: { className?: string }) {
    // No controls for now — the board is just the table. The router still takes
    // sort / timeframe / chains / search, so bringing a control row back is
    // wiring state to these, not rebuilding the query.
    const input = useMemo(() => ({ sort: SORT, timeframe: TIMEFRAME, limit: PAGE }), []);

    // One quick-buy instance for the whole board, not one per row: the hook
    // holds four tRPC mutations and the wallet connection, and fifty copies of
    // that is fifty subscriptions for a button most rows never press.
    const { quickBuy, buyingId } = useQuickBuy();

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
            <div className={cn(GRID, "border-b border-white/5 px-3 pb-2.5 pt-4 text-[13px] font-semibold text-zinc-500")}>
                <span>name</span>
                <span>market price</span>
                <span className="hidden @xl:block">volume</span>
                <span className="hidden @3xl:block">market cap</span>
                <span>change</span>
                {/* The action columns are self-evident from the rows; a header
                    over them would just be noise. They still need their tracks. */}
                <span />
                <span />
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
                    {rows.map((row) => (
                        <TrendingRowView
                            key={row.id}
                            row={row}
                            timeframe={TIMEFRAME}
                            quickBuy={quickBuy}
                            buying={buyingId === row.id}
                        />
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
