"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDownRight01Icon, ArrowUpRight01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { trendingSnapshotStore } from "@/lib/snapshot/surfaces";
import { viewerKey, queryInputKey } from "@/lib/snapshot/keys";
import { useSnapshot, useSnapshotPlaceholder } from "@/hooks/use-snapshot";
import { useQuickBuy } from "@/hooks/use-quick-buy";
import { useBurst } from "@/hooks/use-burst";
import { staggerPulse } from "@/lib/skeleton-stagger";
import { stableHoverColor } from "@/lib/stable-hover-color";
import { tradeUrl, trackedTokenId } from "@/lib/coin-feed/networks";
import { useStuck } from "@/hooks/use-stuck";
import type { AppRouter } from "@/server/routers";
import type { SortKey } from "@/server/routers/trending";
import type { SortingState } from "@tanstack/react-table";
import { DataTable, createDataTableColumnHelper } from "@/components/ui/data-table";
import { useElementWidth } from "@/hooks/use-element-width";
import { ChainBadge } from "./chain-badge";
import { useStar } from "./use-starred";
import { changeTone, compactUsd, percentAbs, tokenPrice } from "./trending-format";
import { CoinSparkline } from "@/components/coins/coin-sparkline";
import { LoadMore } from "@/components/interior/load-more";

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
//
// Sorted by 24h VOLUME, not GT's trending rank: this is the ecosystem's top
// coins, so the biggest markets belong at the top and every chain interleaves
// by one number. (It's also the reference's own order.) "trending" is still a
// sort the router takes, if the board ever grows a control row again.
const TIMEFRAME: Timeframe = "24h";
const SORT = "volume" as const;

const PAGE = 50;

/**
 * The 24h sparkline column — OFF until the tape covers the board.
 *
 * The chart data is real and wired end to end: bars are projected from
 * `coin_trades` on ingest, batched into `trending.list`, and rendered by
 * CoinSparkline. What is missing is OVERLAP.
 *
 * Measured 2026-08-12 after backfilling every trade on the tape: 3 of 199 board
 * rows have 24h bars. The tape holds the pools Helius watches; the board shows
 * Mobula's top coins by volume, and those are almost disjoint sets. A column
 * that draws an em-dash on 98% of rows reads as broken, not as honest — the
 * em-dash is there for the occasional gap, not for the whole column.
 *
 * `/api/cron/tape-watch` is what closes this: it points the Mobula socket at
 * the top 50 BOARD coins and re-picks every minute, so overlap goes from 3 to
 * 50 the moment the Tape DO runs. Flip this on then.
 *
 * A build-time constant rather than a runtime check so the grid track count is
 * decided once — the header and every cell must agree on it, and a value that
 * could change between renders is a board whose columns shift under you.
 */
const SPARKLINE = process.env.NEXT_PUBLIC_TRENDING_SPARKLINE === "1";

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
// Track widths follow the reference's own proportions (measured off it at
// 777px: name ~22%, the three number columns ~15% each, change ~16%, buy ~10%).
//
// Hidden cells occupy no grid track, so the visible cell count has to match the
// track count at EVERY step — keep these in sync with the per-cell
// hidden/@block classes below.
// Track widths per container step, mirroring the reference's own proportions
// (measured off it at 777px: name ~22%, the three number columns ~15% each,
// change ~16%, buy ~10%). The name column stays flexible and absorbs the rest.
//
// CONTAINER width, not viewport width. This board renders inside home's centre
// column, which is narrower than the window by both rails — measuring the
// window would reveal columns that then overflow. `useElementWidth` is the JS
// equivalent of the `@container` this used to use.
const XL = 576; // @xl — volume appears
const THREE_XL = 768; // @3xl — market cap (and the sparkline) appear

function trackWidths(w: number) {
    if (w >= THREE_XL) return { price: "112px", volume: "112px", marketCap: "112px", spark: "88px", change: "116px", buy: "72px", star: "32px" };
    if (w >= XL) return { price: "104px", volume: "104px", marketCap: "112px", spark: "88px", change: "100px", buy: "60px", star: "28px" };
    return { price: "96px", volume: "104px", marketCap: "112px", spark: "88px", change: "92px", buy: "52px", star: "24px" };
}

// ONE size and ONE weight for every string in the table, per the author: the
// hierarchy is carried entirely by colour, so nothing here may set its own
// text-[…] or font-…. The row's two-line name stack is what sets row height
// (two of these plus the icon's padding ≈ the reference's 64px).
const CELL_TEXT = "text-[15px] font-medium leading-tight";

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
        <span className={cn("flex items-center gap-1 tabular-nums", CELL_TEXT, changeTone(pct))}>
            {known && (
                <HugeiconsIcon
                    icon={pct > 0 ? ArrowUpRight01Icon : ArrowDownRight01Icon}
                    className="size-4 shrink-0"
                    strokeWidth={2}
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
    const shared = cn(CELL_TEXT, "text-twitter2 font-bold transition-opacity hover:opacity-80");

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
                {buying ? "Buying…" : "Buy"}
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
            Buy
        </a>
    );
}

function StarCell({ row }: { row: TrendingRow }) {
    const { starred, toggle } = useStar(trackedTokenId(row.network, row.tokenAddress));
    const { bursting, particles, fire } = useBurst();

    const onClick = () => {
        toggle();
        // Celebrate on the way IN only — unstarring just reverses the fill,
        // same rule the like button follows.
        if (!starred) fire();
    };

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={starred}
            aria-label={starred ? "unstar coin" : "star coin"}
            // The like button's animation, in blue: `t-like` + data-liked are
            // the shared hooks, and --like-color is the ONE thing this
            // overrides — it recolours the filled star and every burst dot in
            // one go (:root's pastel red stays the default elsewhere).
            //
            // No [&_path]:fill-current any more: the .t-like-mark rules own the
            // fill now and TRANSITION it, where the old class snapped it on.
            data-liked={starred}
            className={cn(
                "t-like relative z-10 flex cursor-pointer items-center transition-colors [--like-color:var(--color-bleu)]",
                bursting && "is-bursting",
                starred ? "text-bleu" : "text-white hover:text-white/60",
            )}
        >
            {/* The pop scale rides this wrapper, never the <svg> — transforming
                an inline SVG makes Chromium rasterise it at 1× and it goes
                fuzzy on hi-DPI. */}
            <span className="t-like-icon flex">
                <HugeiconsIcon icon={StarIcon} className="t-like-mark size-[18px]" strokeWidth={2} />
            </span>

            <span className="t-like-particles" aria-hidden>
                {particles.map((style, i) => (
                    <i key={i} style={style} />
                ))}
            </span>
        </button>
    );
}

/** Coin identity: icon with its chain badge, name, ticker. The name's stretched
 *  ::after covers the WHOLE row — the row is a <tr> with `position: relative`,
 *  so an absolutely-positioned descendant resolves against the row, not the
 *  cell. Buy and star clear it with `relative z-10`. */
function NameCell({ row }: { row: TrendingRow }) {
    return (
        <span className="flex min-w-0 items-center gap-3">
            {/* The chain mark rides the coin's icon rather than sitting beside
                the ticker: this board spans twenty chains and the same ticker
                exists on several of them, but the reference's ticker line is
                bare — a corner badge keeps both. */}
            <span className="relative shrink-0">
                {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.imageUrl} alt="" loading="lazy" className="size-9 rounded-full object-cover" />
                ) : (
                    <span className="block size-9 rounded-full bg-white/[0.06]" />
                )}
                <ChainBadge
                    network={row.network}
                    className="absolute -bottom-0.5 rounded-full bg-black p-1 -right-0.5 ring-1 p-0 ring-black"
                />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
                {/* The coin PAGE, chain-qualified: this board spans twenty
                    chains and the same address exists on several of them, so
                    naming the chain skips the resolution step entirely. */}
                <Link
                    href={`/coin/${row.network}/${row.tokenAddress}`}
                    className={cn(CELL_TEXT, "cursor-pointer truncate text-left text-white after:absolute after:inset-0 after:content-['']")}
                >
                    {row.name ?? row.symbol}
                </Link>
                <span className={cn(CELL_TEXT, "truncate text-zinc-500")}>{row.symbol}</span>
            </span>
        </span>
    );
}

const helper = createDataTableColumnHelper<TrendingRow>();

const bar = (i: number, count: number, cls: string) => (
    <span style={staggerPulse(i, count)} className={cn("block rounded-xs shimmer-skeleton", cls)} />
);

/**
 * Which router sort a header click means. The board is paged from the server,
 * so sorting has to be the QUERY's, not the loaded page's — sorting fifty rows
 * of a two-hundred-row board client-side would silently answer a different
 * question than the header claims.
 *
 * Change is the only column with both directions, because the router spells
 * them as two different sorts. Volume and market cap are descending-only there,
 * so their sort state is pinned descending rather than offering a toggle that
 * would do nothing.
 */
const DESC_ONLY = new Set(["volume", "marketCap"]);

function routerSort(sorting: SortingState): SortKey {
    const s = sorting[0];
    if (!s) return SORT;
    if (s.id === "change") return s.desc ? "gainers" : "losers";
    if (s.id === "volume") return "volume";
    if (s.id === "marketCap") return "marketCap";
    return SORT;
}

export function TrendingTable({ className }: { className?: string }) {
    // Volume descending is the board's own order — the ecosystem's biggest
    // markets first, with every chain interleaved by one number.
    const [sorting, setSorting] = useState<SortingState>([{ id: "volume", desc: true }]);

    const input = useMemo(
        () => ({ sort: routerSort(sorting), timeframe: TIMEFRAME, limit: PAGE }),
        [sorting],
    );

    // One quick-buy instance for the whole board, not one per row: the hook
    // holds four tRPC mutations and the wallet connection, and fifty copies of
    // that is fifty subscriptions for a button most rows never press.
    const { quickBuy, buyingId } = useQuickBuy();

    const snapshotKey = useMemo(() => viewerKey(null, "trending", queryInputKey(input)), [input]);
    const snapshotPlaceholder = useSnapshotPlaceholder(trendingSnapshotStore.read, snapshotKey);

    const { data, fetchNextPage, hasNextPage, isLoading, isError, isPlaceholderData } =
        trpc.trending.list.useInfiniteQuery(input, {
            getNextPageParam: (last) => last.nextCursor,
            // The board is refreshed by cron every few minutes; anything tighter
            // just re-renders the same rows.
            staleTime: 60_000,
            refetchInterval: 120_000,
            // Painted from the last board we held, which the store refuses to
            // hand back once it is 15 minutes old — the shortest max age of any
            // surface, because both the prices AND the ordering go stale, and a
            // row in the wrong position still looks authoritative.
            placeholderData: snapshotPlaceholder,
        });

    useSnapshot(trendingSnapshotStore, snapshotKey, data, isPlaceholderData);

    const rows = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
    const { sentinelRef: labelsSentinel, stuck: labelsStuck } = useStuck();
    const [boardRef, boardWidth] = useElementWidth<HTMLDivElement>();

    const showVolume = boardWidth >= XL;
    const showWide = boardWidth >= THREE_XL;
    const columnVisibility = useMemo(
        () => ({ volume: showVolume, marketCap: showWide, spark: showWide && SPARKLINE }),
        [showVolume, showWide],
    );

    const columns = useMemo(() => {
        const w = trackWidths(boardWidth);
        return [
            helper.display({
                id: "coin",
                // Sentence case, capital on the first word only — the one place
                // in the app that isn't all-lowercase, per the author.
                header: "Name",
                enableSorting: false,
                cell: ({ row }) => <NameCell row={row.original} />,
                meta: {
                    skeleton: (i, count) => (
                        <span className="flex min-w-0 items-center gap-3">
                            <span style={staggerPulse(i, count)} className="size-9 shrink-0 rounded-full shimmer-skeleton" />
                            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                {bar(i, count, "h-3.5 w-28")}
                                {bar(i, count, "h-3.5 w-16")}
                            </span>
                        </span>
                    ),
                },
            }),
            helper.accessor("priceUsd", {
                id: "price",
                header: "Market price",
                // No server sort by price, and sorting one loaded page would be
                // a lie — so this header stays a label.
                enableSorting: false,
                meta: { width: w.price, skeleton: (i, c) => bar(i, c, "h-3 w-16") },
                cell: ({ row }) => (
                    <span className={cn(CELL_TEXT, "tabular-nums text-white")}>{tokenPrice(row.original.priceUsd)}</span>
                ),
            }),
            helper.accessor((r) => volFor(r, TIMEFRAME) ?? 0, {
                id: "volume",
                header: "Volume",
                sortDescFirst: true,
                meta: { width: w.volume, skeleton: (i, c) => bar(i, c, "h-3 w-14") },
                cell: ({ row }) => (
                    <span className={cn(CELL_TEXT, "tabular-nums text-white")}>
                        {compactUsd(volFor(row.original, TIMEFRAME))}
                    </span>
                ),
            }),
            helper.accessor((r) => r.marketCapUsd ?? 0, {
                id: "marketCap",
                header: "Market cap",
                sortDescFirst: true,
                meta: { width: w.marketCap, skeleton: (i, c) => bar(i, c, "h-3 w-14") },
                cell: ({ row }) => (
                    <span className={cn(CELL_TEXT, "tabular-nums text-white")}>{compactUsd(row.original.marketCapUsd)}</span>
                ),
            }),
            // 24h shape. Bars are projected from the trade tape, so a coin
            // nothing is streaming has none — CoinSparkline draws an em-dash
            // rather than a flat line, because "no series" and "no movement"
            // are different facts.
            helper.display({
                id: "spark",
                header: "Last 24h",
                enableSorting: false,
                meta: { width: w.spark },
                cell: ({ row }) => (
                    <CoinSparkline
                        points={row.original.spark ?? []}
                        width={80}
                        height={26}
                        label={`${row.original.symbol} 24h trend`}
                    />
                ),
            }),
            helper.accessor((r) => pctFor(r, TIMEFRAME) ?? 0, {
                id: "change",
                header: "Change",
                sortDescFirst: true,
                meta: { width: w.change, skeleton: (i, c) => bar(i, c, "h-3 w-12") },
                cell: ({ row }) => <ChangeCell pct={pctFor(row.original, TIMEFRAME)} />,
            }),
            // The action columns are self-evident from the rows; a header over
            // them would just be noise.
            helper.display({
                id: "buy",
                header: "",
                enableSorting: false,
                meta: { width: w.buy, skeleton: (i, c) => bar(i, c, "h-3 w-8") },
                cell: ({ row }) => (
                    <BuyCell row={row.original} quickBuy={quickBuy} buying={buyingId === row.original.id} />
                ),
            }),
            helper.display({
                id: "star",
                header: "",
                enableSorting: false,
                meta: {
                    width: w.star,
                    skeleton: (i, count) => (
                        <span style={staggerPulse(i, count)} className="block size-4 rounded-full shimmer-skeleton" />
                    ),
                },
                cell: ({ row }) => <StarCell row={row.original} />,
            }),
        ];
    }, [boardWidth, quickBuy, buyingId]);

    return (
        // Measures ITSELF, not the viewport — home's centre column is narrower
        // than the window by both rails. Square and unpanelled: it sits directly
        // on the column's own fill rather than floating in a card.
        <div ref={boardRef} className={className}>
            {/* The labels pin as the board scrolls under them, so you can still
                read which column is which a hundred rows down.

                --board-stick is supplied by whoever renders the board and says
                where its header should land — home sets it to sit under the
                category tabs. Defaults to 0px, so a caller that doesn't set it
                gets a header that sticks to the top of its scroller, and the
                board stays usable outside home.

                The canvas fill is applied ONLY while stuck, matching home's
                category strip above: unstuck there is nothing behind these
                labels to hide and an opaque bar would cut off the hero's
                ambient glow; stuck, rows are moving behind them and the fill is
                what stops them showing through. z-15 keeps the labels over the
                board rows while remaining beneath the app header. */}
            {/* h-px, not h-0: a zero-AREA target is an unreliable
                IntersectionObserver subject. -mb-px cancels it, so it costs no
                layout. */}
            <div ref={labelsSentinel} aria-hidden className="h-px -mb-px" />

            {isError ? (
                <p className={cn(CELL_TEXT, "py-16 text-center text-zinc-500")}>couldn&apos;t load the board.</p>
            ) : (
                <DataTable
                    data={rows}
                    columns={columns}
                    getRowId={(r) => r.id}
                    sorting={sorting}
                    onSortingChange={(updater) =>
                        setSorting((prev) => {
                            const next = typeof updater === "function" ? updater(prev) : updater;
                            // Pin the descending-only columns: the router has no
                            // ascending sort for them, so a caret that flipped
                            // would point one way while the rows stayed the other.
                            return next.map((s) => (DESC_ONLY.has(s.id) ? { ...s, desc: true } : s));
                        })
                    }
                    manualSorting
                    columnVisibility={columnVisibility}
                    rowHeight={64}
                    loading={isLoading}
                    skeletonRows={12}
                    rowHoverRadius={12}
                    rowHoverColor={(r) => stableHoverColor(r.id)}
                    stickyHeader
                    stickyTop="var(--board-stick,0px)"
                    headerClassName={cn(
                        "z-15 text-zinc-500 transition-colors duration-200",
                        CELL_TEXT,
                        labelsStuck && "bg-canvas",
                    )}
                    cellClassName="px-1.5"
                    className="px-1.5"
                    emptyState={
                        <div className="flex flex-col items-center gap-1 py-16">
                            <p className={cn(CELL_TEXT, "text-zinc-400")}>nothing here yet</p>
                            <p className={cn(CELL_TEXT, "text-zinc-600")}>the board fills as the chain sweep runs.</p>
                        </div>
                    }
                />
            )}

            {rows.length > 0 && (
                <LoadMore
                    onLoad={() => fetchNextPage()}
                    hasMore={!!hasNextPage}
                    className="px-3 py-4"
                    labels={{ end: "End of the list" }}
                />
            )}
        </div>
    );
}
