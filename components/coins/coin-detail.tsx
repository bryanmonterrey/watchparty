"use client";

// The coin view — identity + market stats, chart, swap.
//
// Rendered by /coin/<address> for any coin that isn't one of our own launches.
// It used to be the body of a chart overlay that home's board and the alerts
// rail popped open; the overlay is gone (every one of those surfaces links to
// the real page now), and this is what survived it.
//
// CoinViewData is deliberately the shape lib/coins/resolve returns, so the page
// hands its result straight in with no mapping.

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon, LinkForwardIcon } from "@hugeicons/core-free-icons";
import { TokenTradingViewChart } from "@/components/tokens/token-tradingview-chart";
import type { ChartMarker } from "@/components/tokens/chart-trade-markers";
import {
    ChartOverlayControls,
    DEFAULT_OVERLAYS,
    type OverlayState,
} from "@/components/tokens/chart-overlay-controls";
import { ChainBadge } from "@/components/trending/chain-badge";
import { StatCarousel } from "./stat-carousel";
import { PinkStarLogo, XIcon, TelegramIcon, GlobeIcon } from "@/components/icons";
import { stableHoverColor } from "@/lib/stable-hover-color";
import { CoinTradePanel } from "./coin-trade-panel";
import { CoinRiskCard } from "./coin-risk-card";
import { CopyTokenAddress } from "./copy-token-address";
import { SwapsTable, MentionsTable } from "./coin-board-tables";
import { TokenBondingCurve } from "@/components/tokens/token-bonding-curve";
import { TokenDescription } from "@/components/tokens/token-description";
import { TokenChatCard } from "@/components/tokens/token-chat-card";
import type { Token } from "@/db/schema/content";
import { cn } from "@/lib/utils";
import { CoinImage } from "@/components/coins/coin-image";
import { trpc } from "@/lib/trpc/client";
import { chainLabel, explorerUrl, tradeUrl } from "@/lib/coin-feed/networks";
import { HomeActionDock } from "@/components/home/home-action-dock";
import { coinTag, logClient } from "@/lib/client-log";
import { Squircle } from "@/components/ui/squircle";
import { DataTable, createDataTableColumnHelper } from "@/components/ui/data-table";
import { retryTransient } from "@/lib/query-retry";

/** What the view needs. Structurally identical to lib/coins/resolve's
 *  ResolvedCoin — declared here because that module is server-only and this
 *  component is not. */
export type CoinViewData = {
    id: string;
    network: string;
    tokenAddress: string;
    poolAddress: string;
    symbol: string;
    name: string | null;
    imageUrl: string | null;
    priceUsd: number | null;
    marketCapUsd: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    priceChange24h: number | null;
    buys24h: number | null;
    sells24h: number | null;
    txns24h: number | null;
    /** Set for coins WE launched (lib/coins/resolve). Mobula covers the rest. */
    socials?: { twitter: string | null; telegram: string | null; website: string | null } | null;
    /**
     * True while a coin is still a DRAFT — no mint exists, so `tokenAddress` is
     * the `tokens` row id standing in as a lookup key (see the route's
     * `coinFromToken`). It must never be rendered AS an address: a nanoid is 21
     * base58-ish characters, so truncated in the header pill it is
     * indistinguishable from a real mint, and it copies clean into a wallet that
     * will never resolve it. Every one of our 59 tokens is currently a draft.
     *
     * Absent means "not a draft", which is right for every coin that arrives
     * through `resolveCoin` — those exist on chain by definition.
     */
    isDraft?: boolean;
};

/**
 * A coin WE launched, when this page is rendering one.
 *
 * The coin page used to fork: `tokens` row -> TokenProfile, anything else ->
 * CoinDetail. That was always meant to be one page, and the fork had already
 * started costing — socials shipped to TokenProfile where 0 of 57 tokens have
 * one, while every coin a user actually opens renders here and had none at all.
 *
 * So the row rides along as a prop rather than being flattened into
 * CoinViewData. The three panels below are the existing TokenProfile components
 * and take a full `Token`; reshaping it would mean maintaining a second
 * projection of the same row for no gain.
 */
export type WatchpartyToken = Token & {
    creator: { id: string; name: string; username: string | null; avatar_url: string | null; wallet_address?: string | null };
};

function compactUsd(value: number | null) {
    if (value == null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: value >= 1_000 ? "compact" : "standard",
        maximumFractionDigits: value >= 1 ? 2 : 6,
    }).format(value);
}

/**
 * One stat, as a discrete rounded box.
 *
 * Boxes rather than the divider-separated cells this used to be: in the
 * reference each stat is its own tile, which is what lets the strip read as a
 * row of facts instead of a table header. Label above, value below.
 */
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="flex min-w-0 shrink-0 flex-col justify-center rounded-xl bg-soft-gray/5 px-3.5 py-2">
            <span className="whitespace-nowrap text-[11px] font-medium text-zinc-500">{label}</span>
            <span className={cn("truncate text-[15px] font-medium tabular-nums", tone ?? "text-white")}>{value}</span>
        </div>
    );
}

/**
 * The coin's header — identity, then market cap, then a strip of stat tiles.
 *
 * A HEADER, not a column. It used to be a 280px sidebar with the stats stacked
 * down it, which cost the chart a fifth of the page to show six numbers — and
 * the chart is the thing anyone came for.
 *
 * Market cap sits OUTSIDE the tiles and larger: it's the number this kind of
 * page is actually read for, and the reference gives it the same emphasis. The
 * rest are peers in tiles beside it.
 *
 * The strip scrolls horizontally rather than wrapping — wrapped, it pushes the
 * chart down the page, and these read as one row.
 */
function CoinHeader({ coin: initial }: { coin: CoinViewData }) {
    // LIVE STATS. The page is a server component that resolves the coin once,
    // so this header used to be frozen at render while the table and chart
    // beneath it refreshed every 15s — the numbers people actually watch were
    // the only ones on the page that never moved.
    //
    // Seeded with the server's own data via `initialData`, so there is no
    // loading flash and no second render on arrival; the poll only ever
    // replaces numbers with newer numbers. Same 15s cadence as the table and
    // chart, and it reads our database rather than an upstream, so a viewer
    // sitting on the page costs a query, not a metered API call.
    const { data: live } = trpc.coin.stats.useQuery(
        { network: initial.network, tokenAddress: initial.tokenAddress },
        {
            enabled: !initial.isDraft,
            initialData: {
                priceUsd: initial.priceUsd,
                marketCapUsd: initial.marketCapUsd,
                liquidityUsd: initial.liquidityUsd,
                volume24hUsd: initial.volume24hUsd,
                priceChange24h: initial.priceChange24h,
                buys24h: initial.buys24h,
                sells24h: initial.sells24h,
                txns24h: initial.txns24h,
            },
            refetchInterval: 15_000,
            staleTime: 10_000,
            retry: retryTransient(1),
        },
    );

    // Identity from the server render (it cannot change under a mounted page),
    // the moving numbers from the poll.
    const coin: CoinViewData = { ...initial, ...(live ?? {}) };
    // A draft has no mint, so there is nothing to link to and nothing to copy.
    // Passing the row id to either would point at an explorer page that does
    // not exist and hand out a string that looks exactly like an address.
    const explorer = coin.isDraft ? null : explorerUrl(coin.network, coin.tokenAddress, coin.poolAddress);
    const up = coin.priceChange24h != null && coin.priceChange24h >= 0;

    return (
        <header className="flex min-w-0 flex-col gap-3 px-4 py-3 @3xl/coin:flex-row @3xl/coin:items-center @3xl/coin:gap-6">
            {/* Identity. shrink-0 so the stat strip gives way first — the coin's
                own name is the last thing that should be squeezed. */}
            <div className="flex min-w-0 shrink-0 items-center gap-3">
                <div className="relative size-11 shrink-0">
                    <CoinImage src={coin.imageUrl} coin={coinTag(coin.network, coin.tokenAddress)} className="size-full rounded-full" />
                    {/* NO `p-1` here. Tailwind is border-box, so padding comes
                        OUT of the declared size: `size-5 p-1` rendered the chain
                        logo at 20 - 8 = 12px inside a black disc, which is why
                        it read as a speck. The disc and the separation from the
                        avatar behind it come from the ring instead, which draws
                        outside the box and costs the image nothing. */}
                    <ChainBadge
                        network={coin.network}
                        className="absolute -bottom-0.5 -right-0.5 size-[18px] rounded-full bg-canvas ring-2 ring-canvas"
                    />
                </div>
                <div className="min-w-0">
                    {/* Socials sit beside the TICKER, not beside the name a line
                        below — that is where the reference puts them and where
                        the eye goes first. They still render nothing when a coin
                        genuinely has no links; drawing dead icons to fill the row
                        would be worse than the gap. */}
                    <div className="flex min-w-0 items-center gap-2">
                        <h1 className="truncate text-xl font-medium tracking-tight text-flexwhite">{coin.symbol}</h1>
                        <CoinSocials coin={coin} />
                        {/* Explorer arrow rides the social row, after the
                            links — it's the same kind of outbound destination,
                            not part of the copy affordance below. */}
                        {explorer && (
                            <a
                                href={explorer}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="view on explorer"
                                className="shrink-0 text-zinc-600 transition-colors hover:text-white"
                            >
                                <HugeiconsIcon icon={LinkForwardIcon} className="size-3.5" strokeWidth={2} />
                            </a>
                        )}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-zinc-500">
                            {coin.name ?? chainLabel(coin.network)}
                        </span>
                        {/* The address sits next to the name as a copy
                            affordance — it was a full-width button at the bottom
                            of the old sidebar, which is a lot of room for a
                            string nobody reads in full. Absent until the coin
                            has a mint; it appears by itself on the first buy. */}
                        {!coin.isDraft && <CopyTokenAddress address={coin.tokenAddress} />}
                    </div>
                </div>
            </div>

            <StatCarousel>
                {/* Market cap leads, untiled and larger — the headline number. */}
                <div className="flex shrink-0 flex-col justify-center pr-2">
                    <span className="whitespace-nowrap text-[11px] font-medium text-zinc-500">Market cap</span>
                    <span className="text-xl font-medium tabular-nums leading-tight text-flexwhite/95">
                        {compactUsd(coin.marketCapUsd)}
                    </span>
                </div>

                <Stat label="Price" value={compactUsd(coin.priceUsd)} />
                <Stat
                    label="24H change"
                    value={coin.priceChange24h == null ? "—" : `${up ? "▲" : "▼"} ${Math.abs(coin.priceChange24h).toFixed(2)}%`}
                    tone={coin.priceChange24h == null ? "text-zinc-500" : up ? "text-lantern" : "text-pastelred"}
                />
                <Stat label="24H Vol." value={compactUsd(coin.volume24hUsd)} />
                <Stat label="Liquidity" value={compactUsd(coin.liquidityUsd)} />
                <Stat label="Txns" value={coin.txns24h?.toLocaleString() ?? "—"} />
                <Stat
                    label="Buys / sells"
                    value={`${coin.buys24h?.toLocaleString() ?? "—"} / ${coin.sells24h?.toLocaleString() ?? "—"}`}
                />
            </StatCarousel>
        </header>
    );
}

const compactAmount = (n: number) =>
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);

/**
 * The swap column's cards — the alerts list's hairline (#18181B, the same
 * RAIL_BORDER value that box carries) and NO fill.
 *
 * Transparent rather than soft-gray-5: the column already sits on the page's
 * canvas, and a second surface colour behind an outlined card reads as two
 * boxes stacked. The outline alone is the card.
 */
const SWAP_CARD = "rounded-[25px] border border-soft-gray/12 bg-transparent";

type TraderRow = {
    account: string;
    username: string | null;
    avatarUrl: string | null;
    /** Net tokens held from the swaps in view: bought minus sold. */
    position: number;
    /** Volume-weighted average price of their BUYS in the window. */
    avgEntry: number | null;
    positionUsd: number | null;
    pnlUsd: number | null;
    pnlPct: number | null;
    /** Unix seconds of their EARLIEST buy in the window — drives "avg. hold".
     *  Null when we only saw them sell. */
    firstBuyTs: number | null;
};

/**
 * Fold the raw swap feed into one row per trader.
 *
 * IMPORTANT, and the table says so too: this is derived from the swaps GT
 * returns — roughly the last 24 hours — not from chain history. Someone who
 * bought a week ago and hasn't traded since simply isn't here, and a position
 * shown is what they moved in the window, not what they hold. A true holders
 * table needs every transfer of the mint indexed and each wallet's cost basis
 * reconstructed; that's a backend project, not a fold over this array.
 */

/** "1d 15h", "7d 1h", "3h 20m" — the reference's avg-hold format. Coarse on
 *  purpose: two units, largest first, no seconds. */
function holdLabel(sinceTs: number | null): string | null {
    if (!sinceTs) return null;
    const secs = Math.max(0, Math.floor(Date.now() / 1000) - sinceTs);
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/** Market cap at a trader's average entry.
 *
 *  The reference shows entry as "$10.2M MC" with the raw price beneath, because
 *  on a memecoin the market cap you bought at is the meaningful comparison and a
 *  price like $0.0102 tells you nothing on its own. Supply is inferred from the
 *  coin's own marketCap/price rather than fetched — the two are already in view
 *  and their ratio IS circulating supply. */
function entryMarketCap(avgEntry: number | null, coin: CoinViewData): number | null {
    if (avgEntry == null || !coin.marketCapUsd || !coin.priceUsd) return null;
    const supply = coin.marketCapUsd / coin.priceUsd;
    if (!Number.isFinite(supply) || supply <= 0) return null;
    return avgEntry * supply;
}

function foldTraders(
    trades: {
        account: string;
        username: string | null;
        avatarUrl: string | null;
        isBuy: boolean;
        usdValue: number;
        tokenAmount: number;
        ts: number;
    }[],
    priceUsd: number | null,
): TraderRow[] {
    const byTrader = new Map<string, TraderRow & { buyTokens: number; buyUsd: number }>();

    for (const t of trades) {
        if (!t.account) continue;
        let row = byTrader.get(t.account);
        if (!row) {
            row = {
                account: t.account,
                username: t.username,
                avatarUrl: t.avatarUrl,
                position: 0,
                avgEntry: null,
                positionUsd: null,
                pnlUsd: null,
                pnlPct: null,
                buyTokens: 0,
                buyUsd: 0,
                firstBuyTs: null,
            };
            byTrader.set(t.account, row);
        }
        row.position += t.isBuy ? t.tokenAmount : -t.tokenAmount;
        if (t.isBuy) {
            row.buyTokens += t.tokenAmount;
            row.buyUsd += t.usdValue;
            // Earliest buy, not latest: "avg. hold" is how long they've been in,
            // so it's measured from when the position was opened.
            if (t.ts && (row.firstBuyTs == null || t.ts < row.firstBuyTs)) row.firstBuyTs = t.ts;
        }
    }

    const rows: TraderRow[] = [];
    for (const row of byTrader.values()) {
        const avgEntry = row.buyTokens > 0 ? row.buyUsd / row.buyTokens : null;
        const positionUsd = priceUsd != null ? row.position * priceUsd : null;
        // Only meaningful while they're still net long — a closed or short
        // position has no unrealised PnL to quote against an entry price.
        const pnlUsd =
            avgEntry != null && priceUsd != null && row.position > 0
                ? row.position * (priceUsd - avgEntry)
                : null;
        rows.push({
            ...row,
            avgEntry,
            positionUsd,
            pnlUsd,
            pnlPct: avgEntry != null && priceUsd != null && row.position > 0
                ? ((priceUsd - avgEntry) / avgEntry) * 100
                : null,
        });
    }

    return rows.sort((a, b) => Math.abs(b.positionUsd ?? 0) - Math.abs(a.positionUsd ?? 0));
}

/**
 * The table under the chart — one row per trader, per the reference's shape.
 *
 * Columns: Trader · Position · PnL · Avg entry · $ (theses).
 *
 * The tab row that was here went with the Type column: with holder-shaped
 * columns, a list of individual swaps and a list of traders aren't two views of
 * one table, and pretending otherwise made both worse.
 */
type TableTab = "holders" | "swaps" | "mentions";

const traderHelper = createDataTableColumnHelper<TraderRow>();

/** A PERSON where the wallet belongs to one. The fallback is the alerts rail's
 *  treatment — a seeded circle with the brand star, never a letter — and
 *  addresses are never rendered in full. */
function TraderCell({ row }: { row: TraderRow }) {
    const hold = holdLabel(row.firstBuyTs);
    return (
        <span className="flex min-w-0 items-center gap-3">
            <span
                className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full"
                style={{ backgroundColor: row.avatarUrl ? undefined : stableHoverColor(row.account) }}
            >
                {row.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.avatarUrl} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                    <PinkStarLogo className="size-[58%]" />
                )}
            </span>
            <span className="flex min-w-0 flex-col">
                <span className={cn("truncate font-medium", row.username ? "text-white" : "text-zinc-400")}>
                    {row.username ?? `${row.account.slice(0, 4)}…${row.account.slice(-4)}`}
                </span>
                {hold && (
                    <span className="flex min-w-0 items-center gap-1 text-[13px] font-medium text-zinc-600">
                        <HugeiconsIcon icon={Clock01Icon} className="size-3 shrink-0" strokeWidth={2} />
                        <span className="truncate">{hold} avg. hold</span>
                    </span>
                )}
            </span>
        </span>
    );
}

/**
 * The trader board under the chart, modelled on Fomo's.
 *
 * Anatomy that matters, top to bottom:
 *
 *  - A TAB ROW (Holders / Swaps / $mentions) with its own filter toggles, not
 *    just column headings. The board answers three different questions off one
 *    data set and the tabs are how you pick.
 *  - Trader is a PERSON and is fenced off by a vertical rule: avatar, name, and
 *    how long they have held. Every other market board prints an address here
 *    because an address is all it has.
 *  - Every numeric cell is TWO lines — the headline figure and the thing that
 *    gives it meaning: position in dollars over the token amount, PnL in dollars
 *    over the percentage, entry market cap over entry price.
 *  - $mentions carries a like count, because a mention IS a post — a cashtag
 *    post about this coin — not a note someone typed into a field.
 */
function CoinTable({ coin }: { coin: CoinViewData }) {
    const [tab, setTab] = React.useState<TableTab>("holders");
    const [mentionsOnly, setMentionsOnly] = React.useState(false);
    const [friendsOnly, setFriendsOnly] = React.useState(false);

    // Every chain, near-live: the server folds all viewers into one upstream
    // call per 5s window, and this refetch rides that cache — so the board
    // ticks like a stream without per-client upstream cost. (The old reader
    // was Solana-only and a minute behind.)
    // Each trader's most recent post carrying this coin's ticker — the last
    // column. Separate from the trades query on purpose: it changes on a post,
    // not on a swap, so it gets its own (slower) cadence instead of refetching
    // with the tape every 15s.
    const { data: tagByUser = {} } = trpc.tags.latestByAuthor.useQuery(
        { network: coin.network, tokenAddress: coin.tokenAddress },
        { staleTime: 60_000, retry: retryTransient(1) },
    );

    const { data: trades = [], isLoading } = trpc.trade.coinTrades.useQuery(
        { network: coin.network, address: coin.tokenAddress },
        // The server cache (mobulaCadence) governs actual freshness per plan;
        // this poll just picks fresh windows up promptly, and it's nearly
        // always answered from Redis.
        { staleTime: 10_000, refetchInterval: 15_000, retry: retryTransient(1) },
    );

    const rows = React.useMemo(() => foldTraders(trades, coin.priceUsd), [trades, coin.priceUsd]);

    // Posts that wrote this ticker. Same query the chart's Tag bubbles use, so
    // it is answered from the same 30s server cache rather than costing a second
    // trip; only fetched once the tab is actually opened.
    const { data: mentions = [], isLoading: mentionsLoading } = trpc.tags.forCoin.useQuery(
        { network: coin.network, tokenAddress: coin.tokenAddress, poolAddress: coin.poolAddress },
        { enabled: tab === "mentions", staleTime: 60_000, retry: retryTransient(1) },
    );

    // How much the table actually has to show, per fetch. `trades` is raw swaps
    // and `rows` is traders folded out of them, so both are worth seeing: zero
    // rows off a non-zero swap count means the fold dropped everything, which
    // reads on screen as "no trader activity" and is a different bug entirely
    // from the upstream returning nothing.
    const seenRef = React.useRef<string>("");
    React.useEffect(() => {
        if (isLoading) return;
        const sig = `${trades.length}:${rows.length}`;
        if (sig === seenRef.current) return; // only log when the numbers move
        seenRef.current = sig;
        logClient("trades", {
            coin: coinTag(coin.network, coin.tokenAddress),
            swaps: trades.length,
            rows: rows.length,
        });
    }, [isLoading, trades.length, rows.length, coin.network, coin.tokenAddress]);

    // Trader is fenced by a rule, so it stays the flexible column and the
    // numbers take fixed shares of what's left. Position, PnL and entry sort
    // from their headers now; the fold's own order is the default.
    const columns = React.useMemo(
        () => [
            traderHelper.display({
                id: "trader",
                header: "Trader",
                cell: ({ row }) => <TraderCell row={row.original} />,
            }),
            traderHelper.accessor((r) => r.positionUsd ?? -1, {
                id: "position",
                header: "Position",
                sortDescFirst: true,
                meta: { width: "19%" },
                cell: ({ row }) => (
                    <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium tabular-nums text-white">
                            {row.original.positionUsd == null ? "—" : compactUsd(row.original.positionUsd)}
                        </span>
                        <span className="truncate text-[13px] font-medium tabular-nums text-zinc-600">
                            {compactAmount(row.original.position)} {coin.symbol}
                        </span>
                    </span>
                ),
            }),
            traderHelper.accessor((r) => r.pnlUsd ?? Number.NEGATIVE_INFINITY, {
                id: "pnl",
                header: "PnL",
                sortDescFirst: true,
                meta: { width: "19%" },
                cell: ({ row }) => {
                    const up = (row.original.pnlUsd ?? 0) >= 0;
                    return (
                        <span className="flex min-w-0 flex-col">
                            <span
                                className={cn(
                                    "truncate font-medium tabular-nums",
                                    row.original.pnlUsd == null ? "text-zinc-500" : up ? "text-lantern" : "text-pastelred",
                                )}
                            >
                                {row.original.pnlUsd == null
                                    ? "—"
                                    : `${up ? "+" : "−"}${compactUsd(Math.abs(row.original.pnlUsd))}`}
                            </span>
                            {row.original.pnlPct != null && (
                                <span
                                    className={cn(
                                        "truncate text-[13px] font-medium tabular-nums",
                                        up ? "text-lantern" : "text-pastelred",
                                    )}
                                >
                                    {up ? "▲" : "▼"} {Math.abs(row.original.pnlPct).toFixed(2)}%
                                </span>
                            )}
                        </span>
                    );
                },
            }),
            // Entry as MARKET CAP over price: on a memecoin "$10.2M MC" is the
            // comparison people actually make, and $0.0102 alone says nothing.
            traderHelper.accessor((r) => r.avgEntry ?? -1, {
                id: "entry",
                header: "Avg. entry",
                sortDescFirst: true,
                meta: { width: "19%" },
                cell: ({ row }) => {
                    const entryMc = entryMarketCap(row.original.avgEntry, coin);
                    return (
                        <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium tabular-nums text-white">
                                {entryMc == null ? (
                                    row.original.avgEntry == null ? "—" : compactUsd(row.original.avgEntry)
                                ) : (
                                    <>
                                        {compactUsd(entryMc)} <span className="font-medium text-zinc-600">MC</span>
                                    </>
                                )}
                            </span>
                            {entryMc != null && row.original.avgEntry != null && (
                                <span className="truncate text-[13px] font-medium tabular-nums text-zinc-600">
                                    {compactUsd(row.original.avgEntry)}
                                </span>
                            )}
                        </span>
                    );
                },
            }),
            // Tags — this trader's MOST RECENT post carrying the coin's ticker.
            // One line per trader, not a feed: the table answers "what does this
            // person say about the coin", and their latest take is that answer.
            // Keyed by USERNAME, which is what `resolveTraders` gives the row —
            // an anonymous wallet has nothing to say here by definition.
            traderHelper.display({
                id: "tags",
                header: "Tags",
                meta: { width: "24%" },
                cell: ({ row }) =>
                    row.original.username && tagByUser[row.original.username] ? (
                        <span className="min-w-0 truncate text-[13px] font-medium text-zinc-300">
                            {tagByUser[row.original.username].text}
                        </span>
                    ) : (
                        <span className="min-w-0 truncate font-medium text-zinc-700">—</span>
                    ),
            }),
        ],
        [coin, tagByUser],
    );

    const TABS: { id: TableTab; label: string }[] = [
        { id: "holders", label: "Holders" },
        { id: "swaps", label: "Swaps" },
        // Counts TAGS, not traders. It read `rows.length` — the folded trader
        // count — under a label that says Tags, so the number was always about
        // a different thing than the word next to it.
        { id: "mentions", label: `Tags${mentions.length ? ` (${mentions.length})` : ""}` },
    ];

    return (
        <section className="flex min-w-0 flex-col mt-4 pb-4">
        {/* ONE box around the whole board — header, column headings and rows.
            Not a squircle on the header alone: two stroked paths that meet draw
            two hairlines and the seam between them can't be removed (the alerts
            rail learned this the hard way — see RailShell's `header` prop). With
            one path, the divider under the tabs is an ordinary internal
            border-b, which is exactly what it should be.

            The hairline (innerBorder={RAIL_BORDER}) is OFF for now per design —
            restore it there if the table gets its outline back. */}
        <Squircle
            radius={25}
            autoEffects={false}
            // bg-canvas spelled out rather than left to inherit: the board is
            // deliberately flat now, and an explicit fill means it can't pick up
            // a tint from whatever it's dropped into later.
            className="flex min-w-0 flex-col overflow-hidden bg-canvas"
        >
            {/* Tab row. Divided by hairlines rather than spacing — the reference
                reads as one control, not three separate links. */}
            {/* No fill — an internal row of the box above, divided from the
                table by an ordinary border-b. */}
            <div className="flex min-w-0 items-center justify-between gap-4 pl-1.5 pr-4 py-4">
                <div className="flex min-w-0 items-center">
                    {TABS.map((t, i) => (
                        <React.Fragment key={t.id}>
                            {i > 0 && <span className="mx-5 h-5 w-px shrink-0 bg-flexwhite/10" />}
                            <button
                                type="button"
                                onClick={() => setTab(t.id)}
                                className={cn(
                                    "cursor-pointer whitespace-nowrap text-[17px] font-medium transition-colors",
                                    tab === t.id ? "text-white" : "text-zinc-600 hover:text-zinc-400",
                                )}
                            >
                                {t.label}
                            </button>
                        </React.Fragment>
                    ))}
                </div>

                <div className="flex shrink-0 items-center gap-4">
                    <Toggle checked={mentionsOnly} onChange={setMentionsOnly} label="Tags only" />
                    <Toggle checked={friendsOnly} onChange={setFriendsOnly} label="Friends only" />
                </div>
            </div>

            {/* The tab actually SWITCHES the board now. It used to set state
                that only recoloured the active label, so Holders, Swaps and
                Tags all rendered this same folded-trader table — a "Swaps" tab
                showing one row per trader is not a list of swaps. */}
            {tab === "holders" ? (
                <DataTable
                    data={rows.slice(0, 25)}
                    columns={columns}
                    getRowId={(r) => r.account}
                    rowHeight={68}
                    loading={isLoading}
                    skeletonRows={6}
                    rowHoverRadius={12}
                    rowHoverColor={(r) => stableHoverColor(r.account)}
                    className="px-1.5 pb-1.5"
                    emptyState={<p className="px-4 py-6 text-left text-sm text-zinc-500">No trader activity yet.</p>}
                />
            ) : tab === "swaps" ? (
                <SwapsTable trades={trades} loading={isLoading} />
            ) : (
                <MentionsTable mentions={mentions} loading={mentionsLoading} />
            )}

            {tab === "holders" && rows.length > 0 && !isLoading && (
                <p className="px-4 py-3 text-[12px] text-zinc-600">
                    From swaps in the last 24h — not full chain history.
                </p>
            )}
        </Squircle>
        </section>
    );
}

/** Filter toggle — a checkbox (not a switch). Round, per the house rule that
 *  every checkbox is rounded-full. */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-300"
        >
            <span
                className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                    checked ? "border-lantern bg-lantern" : "border-flexwhite/20",
                )}
            >
                {checked && (
                    <svg viewBox="0 0 10 8" className="size-2.5 text-black" fill="none">
                        <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </span>
            {label}
        </button>
    );
}

function CoinChart({ coin }: { coin: CoinViewData }) {
    const [overlays, setOverlays] = React.useState<OverlayState>(DEFAULT_OVERLAYS);

    // The SAME query the trades table runs, so this costs no extra request —
    // react-query dedupes on the key and both components read one cache entry.
    // It already resolves each wallet to a site identity (`resolveTraders`),
    // which is exactly what the bubbles need: a face, or nothing.
    const { data: trades = [] } = trpc.trade.coinTrades.useQuery(
        { network: coin.network, address: coin.tokenAddress },
        { staleTime: 10_000, refetchInterval: 15_000, retry: retryTransient(1) },
    );

    // Tags: posts that wrote this coin's ticker. Anchored at the post's time
    // and the price of the candle covering that minute — the author need never
    // have traded, which is exactly what separates a Tag from a swap marker.
    const { data: tags = [] } = trpc.tags.forCoin.useQuery(
        { network: coin.network, tokenAddress: coin.tokenAddress, poolAddress: coin.poolAddress },
        { staleTime: 60_000, enabled: overlays.tags, retry: retryTransient(1) },
    );

    const tagMarkers = React.useMemo<ChartMarker[]>(() => {
        if (!overlays.tags) return [];
        return tags
            // No candle for that minute -> no honest height for the bubble.
            .filter((t) => t.priceUsd != null && t.ts > 0)
            .map((t) => ({
                key: `tag-${t.id}`,
                ts: t.ts,
                priceUsd: t.priceUsd as number,
                // A Tag is a statement, not a side. Neutral ring: colouring it
                // green or red would assert a direction the post never made.
                isBuy: true,
                username: t.username,
                avatarUrl: t.avatarUrl,
                tag: t.text,
            }));
    }, [tags, overlays.tags]);

    const swapMarkers = React.useMemo<ChartMarker[]>(() => {
        if (!overlays.mySwaps) return [];
        return trades
            // A marker is a PERSON. A wallet with no site identity has no
            // avatar to draw and no Tag to carry, so it would render as a wall
            // of identical placeholder circles — which is what the reference
            // avoids by only marking its own users.
            .filter((t) => !!t.username)
            .map((t) => ({
                key: t.txHash || `${t.account}-${t.ts}`,
                ts: t.ts,
                // Execution price. `usdValue / tokenAmount` rather than the
                // coin's current price, or every bubble would sit on today's
                // line instead of where the trade actually happened.
                priceUsd:
                    t.tokenAmount > 0 && t.usdValue > 0 ? t.usdValue / t.tokenAmount : (coin.priceUsd ?? 0),
                isBuy: t.isBuy,
                username: t.username,
                avatarUrl: t.avatarUrl,
                usdValue: t.usdValue,
            }))
            .filter((m) => m.priceUsd > 0 && m.ts > 0);
    }, [trades, overlays.mySwaps, coin.priceUsd]);

    const markers = React.useMemo(() => [...swapMarkers, ...tagMarkers], [swapMarkers, tagMarkers]);

    return (
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* EVERY chain, not just Solana. GeckoTerminal indexes them all —
                the datafeed was hardcoded to /networks/solana, so the network
                now rides in the symbol (`base:0x…`) and this renders whatever
                the coin is on. The "open the market venue" fallback that used
                to stand in for non-Solana chains is gone with it. */}
            <div className="h-[min(68vh,720px)] min-h-[420px] flex-1 bg-canvas">
                <TokenTradingViewChart
                    mint={coin.tokenAddress}
                    ticker={coin.symbol}
                    network={coin.network}
                    // Turns on live bars — the chart subscribes to this pool's
                    // candles instead of polling. See lib/coins/candle-stream.
                    poolAddress={coin.poolAddress}
                    markers={markers}
                    markerMinUsd={overlays.minUsd}
                    className="h-full w-full"
                />
            </div>
            <ChartOverlayControls value={overlays} onChange={setOverlays} />
            <CoinTable coin={coin} />
        </main>
    );
}

function CoinSwap({ coin }: { coin: CoinViewData }) {
    const marketUrl = tradeUrl(coin.network, coin.tokenAddress, coin.poolAddress);

    // The buy/sell panel replaced the drawer's generic SwapView here — every
    // coin on every routable chain trades in place now (Jupiter for Solana,
    // LI.FI for the EVM chains), and the panel owns its own gates: connect
    // card, unsupported-chain card, quote errors. See coin-trade-panel.tsx.
    //
    // The card chrome (SWAP_CARD) is passed in so this file stays the single
    // owner of the swap column's outline style.
    return (
        <aside className="pr-0">
            <div className="@4xl/coin:sticky @4xl/coin:top-0">
                <CoinTradePanel key={coin.id} coin={coin} marketUrl={marketUrl} cardClassName={SWAP_CARD} />
                <CoinRiskCard coin={coin} cardClassName={SWAP_CARD} enabled={!coin.isDraft} />
            </div>
        </aside>
    );
}

/**
 * The coin view: alerts rail (from the route group) | header + chart | swap |
 * action dock — the same four columns home and /feed run.
 *
 * TWO things about the grid are load-bearing:
 *
 * 1. `@container/coin` sits on a WRAPPER, not on the grid itself. An element
 *    cannot respond to its own container query, so declaring the container and
 *    the `@4xl:grid-cols-…` on one element left it permanently at grid-cols-1 —
 *    the swap panel stacked under the chart and the page looked like it had no
 *    right column at all.
 *
 * 2. Container queries rather than viewport ones, because this column is
 *    already narrowed by the alerts rail and the dock — `xl:` would measure
 *    width this component doesn't own and split at the wrong moment.
 *
 * The dock is a sibling of the whole grid, so it stays a full-height gutter on
 * the right rather than becoming a grid cell.
 */
export function CoinDetail({ coin, wpToken }: { coin: CoinViewData; wpToken?: WatchpartyToken }) {
    // One line per coin opened. Keyed on the coin so a client-side navigation
    // between coins logs each one — this page is reached far more often by
    // in-app link than by fresh load, and a mount-only log would miss most of it.
    React.useEffect(() => {
        logClient("coin", {
            coin: coinTag(coin.network, coin.tokenAddress),
            symbol: coin.symbol,
            hasPrice: coin.priceUsd != null,
            hasPool: !!coin.poolAddress,
        });
    }, [coin.network, coin.tokenAddress, coin.symbol, coin.priceUsd, coin.poolAddress]);

    return (
        <div className="flex w-full min-w-0">
            <div className="pl-3 @container/coin min-w-0 flex-1 pt-header">
                <div className="grid gap-1 min-h-full grid-cols-1 @4xl/coin:grid-cols-[minmax(0,1fr)_324px]">
                    {/* Header and chart are one column — the header spans the
                        chart's width and nothing else. */}
                    {/* The left column is the coin itself: who it is, and what
                        the price did. Everything that is commentary ON it —
                        risk, the creator's pitch, curve progress, the room —
                        reads down the right column under the trade panel, so
                        the chart keeps the width it is worth. */}
                    <div className="flex min-w-0 flex-col">
                        <CoinHeader coin={coin} />
                        <CoinChart coin={coin} />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                        <CoinSwap coin={coin} />
                        {/* Creator + description: identity a coin we launched
                            has and a Dexscreener row never will. */}
                        {wpToken && <TokenDescription token={wpToken} compact cardClassName={SWAP_CARD} />}
                        {/* Only for our own pre-migration launches: while a coin
                            is still on the curve, progress IS the story.
                            TokenBondingCurve no-ops on any other phase, so this
                            needs no second condition. */}
                        {wpToken && <TokenBondingCurve token={wpToken} compact cardClassName={SWAP_CARD} />}
                        {wpToken && <TokenChatCard token={wpToken} creatorUsername={wpToken.creator.username} />}
                    </div>
                </div>
            </div>

            <HomeActionDock />
        </div>
    );
}

/**
 * Social links for a coin we did NOT launch.
 *
 * External coins had none anywhere in the app: `resolveCoin` never carried
 * them, and the chain-wide feed sets `hasSocials: {}` on every row. Only our own
 * `tokens` rows have twitter/telegram/website columns, so a coin page for
 * anything off the trending board or the alerts rail showed nothing.
 *
 * Costs no extra request. `trade.coinSecurity` already fetches Mobula's
 * token/details for the security card below, that response has always carried
 * `socials`, and this is the same tRPC input — so TanStack serves both
 * components from one query.
 */
function CoinSocials({ coin }: { coin: CoinViewData }) {
    // Ours wins, and skips the request entirely. A coin we launched has its
    // links in `tokens` and Mobula has never heard of it — asking anyway would
    // spend a call to be told nothing, at exactly the moment the links matter.
    const own = coin.socials ?? null;
    const { data } = trpc.trade.coinSecurity.useQuery(
        { network: coin.network, address: coin.tokenAddress },
        // Not for a draft: `tokenAddress` is a row id there, so the call can
        // only ever come back empty, and the Mobula free tier 429s at the best
        // of times (see CLAUDE.md).
        { staleTime: 120_000, enabled: !own && !coin.isDraft },
    );
    const socials = own ?? data?.socials;
    if (!socials) return null;

    const links = [
        socials.twitter ? { href: socials.twitter, Icon: XIcon, label: "X" } : null,
        socials.telegram ? { href: socials.telegram, Icon: TelegramIcon, label: "Telegram" } : null,
        socials.website ? { href: socials.website, Icon: GlobeIcon, label: "Website" } : null,
    ].filter((l): l is { href: string; Icon: typeof XIcon; label: string } => l !== null);
    if (!links.length) return null;

    return (
        <>
            {links.map(({ href, Icon, label }) => (
                <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="shrink-0 text-zinc-600 transition-colors hover:text-white motion-reduce:transition-none"
                >
                    <Icon className="size-3.5" />
                </a>
            ))}
        </>
    );
}
