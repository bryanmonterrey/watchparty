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
import { useWallet } from "@solana/wallet-adapter-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { TokenTradingViewChart } from "@/components/tokens/token-tradingview-chart";
import { ChainBadge } from "@/components/trending/chain-badge";
import { PinkStarLogo } from "@/components/icons";
import { stableHoverColor } from "@/lib/stable-hover-color";
import { SwapView } from "@/components/wallet/wallet-drawer2/views/swap/swap-view";
import type { Token as SwapToken } from "@/components/wallet/wallet-drawer2/views/swap/token-selector-modal";
import { OPEN_WALLET_DRAWER_EVENT } from "@/components/wallet/sol-balance-chip";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/use-auth-session";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { chainLabel, explorerUrl, tradeUrl } from "@/lib/coin-feed/networks";
import { HomeActionDock } from "@/components/home/home-action-dock";

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
        <div className="flex min-w-0 shrink-0 flex-col justify-center rounded-xl border border-flexwhite/10 bg-soft-gray-5 px-3.5 py-2">
            <span className="whitespace-nowrap text-[11px] font-medium text-zinc-500">{label}</span>
            <span className={cn("truncate text-[15px] font-bold tabular-nums", tone ?? "text-white")}>{value}</span>
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
function CoinHeader({ coin }: { coin: CoinViewData }) {
    const explorer = explorerUrl(coin.network, coin.tokenAddress, coin.poolAddress);
    const up = coin.priceChange24h != null && coin.priceChange24h >= 0;

    return (
        <header className="flex min-w-0 flex-col gap-3 px-4 py-3 @3xl/coin:flex-row @3xl/coin:items-center @3xl/coin:gap-6">
            {/* Identity. shrink-0 so the stat strip gives way first — the coin's
                own name is the last thing that should be squeezed. */}
            <div className="flex min-w-0 shrink-0 items-center gap-3">
                <div className="relative size-11 shrink-0">
                    {coin.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coin.imageUrl} alt="" className="size-full rounded-full object-cover" />
                    ) : (
                        <div className="size-full rounded-full bg-soft-gray-10" />
                    )}
                    <ChainBadge network={coin.network} className="absolute -bottom-1 -right-1 rounded-full bg-black p-1 ring-1 ring-black" />
                </div>
                <div className="min-w-0">
                    <h1 className="truncate text-xl font-bold tracking-tight text-white">{coin.symbol}</h1>
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-zinc-500">
                            {coin.name ?? chainLabel(coin.network)}
                        </span>
                        {/* The address sits next to the name as a copy
                            affordance — it was a full-width button at the bottom
                            of the old sidebar, which is a lot of room for a
                            string nobody reads in full. */}
                        <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(coin.tokenAddress)}
                            aria-label="copy token address"
                            className="flex shrink-0 cursor-pointer items-center gap-1 text-[13px] font-medium text-zinc-600 transition-colors hover:text-white"
                        >
                            <span className="hidden @xl/coin:inline">
                                {coin.tokenAddress.slice(0, 5)}…{coin.tokenAddress.slice(-5)}
                            </span>
                            <HugeiconsIcon icon={Copy01Icon} className="size-3.5" strokeWidth={2} />
                        </button>
                        {explorer && (
                            <a
                                href={explorer}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="view on explorer"
                                className="shrink-0 text-zinc-600 transition-colors hover:text-white"
                            >
                                <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" strokeWidth={2} />
                            </a>
                        )}
                    </div>
                </div>
            </div>

            <div className="hidden-scrollbar -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-0.5">
                {/* Market cap leads, untiled and larger — the headline number. */}
                <div className="flex shrink-0 flex-col justify-center pr-2">
                    <span className="whitespace-nowrap text-[11px] font-medium text-zinc-500">Market cap</span>
                    <span className="text-xl font-bold tabular-nums leading-tight text-white">
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
            </div>
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
const SWAP_CARD = "rounded-2xl border border-[#18181B] bg-transparent";

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
function foldTraders(
    trades: {
        account: string;
        username: string | null;
        avatarUrl: string | null;
        isBuy: boolean;
        usdValue: number;
        tokenAmount: number;
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
            };
            byTrader.set(t.account, row);
        }
        row.position += t.isBuy ? t.tokenAmount : -t.tokenAmount;
        if (t.isBuy) {
            row.buyTokens += t.tokenAmount;
            row.buyUsd += t.usdValue;
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
function CoinTable({ coin }: { coin: CoinViewData }) {
    const { data: trades = [], isLoading } = trpc.wallet.getTokenTrades.useQuery(
        { mint: coin.tokenAddress },
        { enabled: coin.network === "solana", staleTime: 30_000, refetchInterval: 30_000, retry: 1 },
    );

    const rows = React.useMemo(() => foldTraders(trades, coin.priceUsd), [trades, coin.priceUsd]);

    // One definition for the header and every row, so columns can't drift.
    const GRID =
        "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_56px] items-center gap-3 px-4";

    return (
        <section className="flex min-w-0 flex-col">
            <div className={cn(GRID, "pb-2 pt-4 text-[13px] font-medium text-zinc-600")}>
                <span>Trader</span>
                <span>Position</span>
                <span>PnL</span>
                <span>Avg entry</span>
                <span className="text-right">$</span>
            </div>

            {coin.network !== "solana" ? (
                <p className="px-4 pb-8 text-sm text-zinc-500">
                    Trader activity is read from the Solana pool. Open the market venue for {chainLabel(coin.network)}.
                </p>
            ) : isLoading ? (
                <div className="space-y-1 px-4 pb-5">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-12 rounded-lg shimmer-skeleton" />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <p className="px-4 pb-8 text-sm text-zinc-500">No trader activity yet.</p>
            ) : (
                <div className="pb-4">
                    {rows.slice(0, 25).map((row) => {
                        const up = (row.pnlUsd ?? 0) >= 0;
                        return (
                            <div key={row.account} className={cn(GRID, "py-2.5 text-[14px] transition-colors hover:bg-white/[0.03]")}>
                                {/* A PERSON where the wallet belongs to one. Every
                                    other market board shows an address here,
                                    because an address is all they have. The
                                    fallback is the alerts rail's treatment — a
                                    seeded circle with the brand star, never a
                                    letter — and addresses are never rendered in
                                    full. */}
                                <span className="flex min-w-0 items-center gap-2">
                                    <span
                                        className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full"
                                        style={{ backgroundColor: row.avatarUrl ? undefined : stableHoverColor(row.account) }}
                                    >
                                        {row.avatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={row.avatarUrl} alt="" loading="lazy" className="size-full object-cover" />
                                        ) : (
                                            <PinkStarLogo className="size-[58%]" />
                                        )}
                                    </span>
                                    <span className={cn("truncate font-bold", row.username ? "text-white" : "text-zinc-400")}>
                                        {row.username ?? `${row.account.slice(0, 4)}…${row.account.slice(-4)}`}
                                    </span>
                                </span>

                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate font-bold tabular-nums text-white">
                                        {row.positionUsd == null ? "—" : compactUsd(row.positionUsd)}
                                    </span>
                                    <span className="truncate text-[12px] font-medium tabular-nums text-zinc-500">
                                        {compactAmount(row.position)} {coin.symbol}
                                    </span>
                                </span>

                                <span className="flex min-w-0 flex-col">
                                    <span className={cn("truncate font-bold tabular-nums", row.pnlUsd == null ? "text-zinc-500" : up ? "text-lantern" : "text-pastelred")}>
                                        {row.pnlUsd == null ? "—" : `${up ? "+" : "−"}${compactUsd(Math.abs(row.pnlUsd))}`}
                                    </span>
                                    {row.pnlPct != null && (
                                        <span className={cn("truncate text-[12px] font-medium tabular-nums", up ? "text-lantern" : "text-pastelred")}>
                                            {up ? "▲" : "▼"} {Math.abs(row.pnlPct).toFixed(2)}%
                                        </span>
                                    )}
                                </span>

                                <span className="truncate font-bold tabular-nums text-white">
                                    {row.avgEntry == null ? "—" : compactUsd(row.avgEntry)}
                                </span>

                                {/* Theses — posts mentioning the coin's cashtag.
                                    Not wired yet; the column is here because it's
                                    the differentiated one and the shape should
                                    exist before the data lands. */}
                                <span className="text-right font-medium tabular-nums text-zinc-600">—</span>
                            </div>
                        );
                    })}

                    <p className="px-4 pt-3 text-[12px] text-zinc-600">
                        From swaps in the last 24h — not full chain history.
                    </p>
                </div>
            )}
        </section>
    );
}

function CoinChart({ coin }: { coin: CoinViewData }) {
    return (
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* EVERY chain, not just Solana. GeckoTerminal indexes them all —
                the datafeed was hardcoded to /networks/solana, so the network
                now rides in the symbol (`base:0x…`) and this renders whatever
                the coin is on. The "open the market venue" fallback that used
                to stand in for non-Solana chains is gone with it. */}
            <div className="h-[min(64vh,720px)] min-h-[420px] flex-1 bg-black">
                <TokenTradingViewChart
                    mint={coin.tokenAddress}
                    ticker={coin.symbol}
                    network={coin.network}
                    // Turns on live bars — the chart subscribes to this pool's
                    // candles instead of polling. See lib/coins/candle-stream.
                    poolAddress={coin.poolAddress}
                    className="h-full w-full"
                />
            </div>
            <CoinTable coin={coin} />
        </main>
    );
}

function CoinSwap({ coin }: { coin: CoinViewData }) {
    const { data: session } = useAuthSession();
    const { publicKey } = useWallet();
    const walletAddress = publicKey?.toBase58() || session?.user?.wallet_address || "";
    const marketUrl = tradeUrl(coin.network, coin.tokenAddress, coin.poolAddress);
    const { data: metadata, isLoading } = trpc.wallet.getTokensByMints.useQuery(
        { ids: [coin.tokenAddress] },
        { enabled: coin.network === "solana" && !!walletAddress, staleTime: 60 * 60 * 1000 },
    );
    const tokenMetadata = metadata?.[coin.tokenAddress];
    const outputToken: SwapToken | null = tokenMetadata?.decimals != null ? {
        address: coin.tokenAddress,
        symbol: tokenMetadata.symbol || coin.symbol,
        name: tokenMetadata.name || coin.name || coin.symbol,
        decimals: tokenMetadata.decimals,
        logoURI: tokenMetadata.logoURI || coin.imageUrl || undefined,
    } : null;

    // The cards below carry the same hairline the alerts list does
    // (RAIL_BORDER, #18181B) with no fill of their own, so each reads as an
    // outlined card on the page rather than a second surface colour. See
    // SWAP_CARD.
    return (
        <aside className="p-4">
            <div className="@4xl/coin:sticky @4xl/coin:top-0">
                {coin.network !== "solana" ? (
                    <div className={SWAP_CARD + " p-5"}>
                        <h3 className="text-lg font-bold text-white">Trade {coin.symbol}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-500">In-app swaps currently route through Jupiter on Solana. Use the live venue for {chainLabel(coin.network)}.</p>
                        {marketUrl && <Button asChild className="mt-5 h-12 w-full rounded-full bg-white font-bold text-black hover:bg-white/85"><a href={marketUrl} target="_blank" rel="noopener noreferrer">Open market</a></Button>}
                    </div>
                ) : !walletAddress ? (
                    <div className={SWAP_CARD + " p-5"}>
                        <h3 className="text-lg font-bold text-white">Swap {coin.symbol}</h3>
                        <p className="mt-2 text-sm text-zinc-500">Connect or unlock your wallet to trade this coin through Jupiter.</p>
                        <Button onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT))} className="mt-5 h-12 w-full rounded-full bg-white font-bold text-black hover:bg-white/85">Open wallet</Button>
                    </div>
                ) : isLoading ? (
                    <div className="h-[430px] rounded-2xl shimmer-skeleton" />
                ) : !outputToken ? (
                    <div className={SWAP_CARD + " p-5"}>
                        <h3 className="text-lg font-bold text-white">Swap unavailable</h3>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-500">This coin is not available from the current Jupiter token metadata source.</p>
                        {marketUrl && <Button asChild className="mt-5 h-12 w-full rounded-full bg-white font-bold text-black hover:bg-white/85"><a href={marketUrl} target="_blank" rel="noopener noreferrer">Open market</a></Button>}
                    </div>
                ) : (
                    <div className={SWAP_CARD + " overflow-hidden"}>
                        <SwapView key={coin.id} walletAddress={walletAddress} onBack={() => {}} initialOutputToken={outputToken} showBack={false} />
                    </div>
                )}
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
export function CoinDetail({ coin }: { coin: CoinViewData }) {
    return (
        <div className="flex w-full min-w-0">
            <div className="ml-5 @container/coin min-w-0 flex-1 pt-header">
                <div className="grid min-h-full grid-cols-1 @4xl/coin:grid-cols-[minmax(0,1fr)_360px]">
                    {/* Header and chart are one column — the header spans the
                        chart's width and nothing else. */}
                    <div className="flex min-w-0 flex-col">
                        <CoinHeader coin={coin} />
                        <CoinChart coin={coin} />
                    </div>
                    <CoinSwap coin={coin} />
                </div>
            </div>

            <HomeActionDock />
        </div>
    );
}
