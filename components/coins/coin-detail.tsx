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

import { useWallet } from "@solana/wallet-adapter-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { TokenTradingViewChart } from "@/components/tokens/token-tradingview-chart";
import { ChainBadge } from "@/components/trending/chain-badge";
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
        <header className="flex min-w-0 flex-col gap-3 border-b border-soft-gray/10 px-4 py-3 @3xl/coin:flex-row @3xl/coin:items-center @3xl/coin:gap-6">
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

function MarketTrades({ coin }: { coin: CoinViewData }) {
    const { data: trades = [], isLoading } = trpc.wallet.getTokenTrades.useQuery(
        { mint: coin.tokenAddress },
        { enabled: coin.network === "solana", staleTime: 30_000, refetchInterval: 30_000, retry: 1 },
    );

    return (
        <section className="border-t border-soft-gray/10">
            <div className="flex items-center justify-between px-5 py-4">
                <h3 className="text-base font-bold text-white">Recent transactions</h3>
                <span className="text-xs font-medium text-zinc-600">live market trades</span>
            </div>
            {coin.network !== "solana" ? (
                <p className="px-5 pb-8 text-sm text-zinc-500">On-chain transactions for {chainLabel(coin.network)} open on the external market venue.</p>
            ) : isLoading ? (
                <div className="space-y-px px-5 pb-5">
                    {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-11 rounded-lg shimmer-skeleton" />)}
                </div>
            ) : trades.length === 0 ? (
                <p className="px-5 pb-8 text-sm text-zinc-500">No recent trades.</p>
            ) : (
                <div className="divide-y divide-soft-gray/10">
                    {trades.slice(0, 12).map((trade, index) => (
                        <a
                            key={trade.txHash || index}
                            href={`https://solscan.io/tx/${trade.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="grid grid-cols-[80px_1fr_1fr_auto] items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-white/2"
                        >
                            <span className={trade.isBuy ? "font-bold text-lantern" : "font-bold text-pastelred"}>{trade.isBuy ? "Buy" : "Sell"}</span>
                            <span className="truncate text-zinc-400">{trade.account}</span>
                            <span className="text-right font-semibold tabular-nums text-zinc-200">{compactUsd(trade.usdValue)}</span>
                            <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4 text-zinc-600" strokeWidth={2} />
                        </a>
                    ))}
                </div>
            )}
        </section>
    );
}

function CoinChart({ coin }: { coin: CoinViewData }) {
    const marketUrl = tradeUrl(coin.network, coin.tokenAddress, coin.poolAddress);

    return (
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="h-[min(64vh,720px)] min-h-[420px] flex-1 bg-black">
                {coin.network === "solana" ? (
                    <TokenTradingViewChart mint={coin.tokenAddress} ticker={coin.symbol} className="h-full w-full" />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                        <p className="text-lg font-semibold text-white">Chart available on {chainLabel(coin.network)}</p>
                        <p className="max-w-md text-sm text-zinc-500">The in-app chart currently supports Solana markets. Open the live pool for this network’s candles and depth.</p>
                        {marketUrl && (
                            <a href={marketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-black hover:bg-white/85">
                                Open market
                                <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" strokeWidth={2} />
                            </a>
                        )}
                    </div>
                )}
            </div>
            <MarketTrades coin={coin} />
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

    return (
        <aside className="p-4 @4xl/coin:border-l @4xl/coin:border-soft-gray/10">
            <div className="@4xl/coin:sticky @4xl/coin:top-0">
                {coin.network !== "solana" ? (
                    <div className="rounded-2xl bg-soft-gray-5 p-5">
                        <h3 className="text-lg font-bold text-white">Trade {coin.symbol}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-500">In-app swaps currently route through Jupiter on Solana. Use the live venue for {chainLabel(coin.network)}.</p>
                        {marketUrl && <Button asChild className="mt-5 h-12 w-full rounded-full bg-white font-bold text-black hover:bg-white/85"><a href={marketUrl} target="_blank" rel="noopener noreferrer">Open market</a></Button>}
                    </div>
                ) : !walletAddress ? (
                    <div className="rounded-2xl bg-soft-gray-5 p-5">
                        <h3 className="text-lg font-bold text-white">Swap {coin.symbol}</h3>
                        <p className="mt-2 text-sm text-zinc-500">Connect or unlock your wallet to trade this coin through Jupiter.</p>
                        <Button onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT))} className="mt-5 h-12 w-full rounded-full bg-white font-bold text-black hover:bg-white/85">Open wallet</Button>
                    </div>
                ) : isLoading ? (
                    <div className="h-[430px] rounded-2xl shimmer-skeleton" />
                ) : !outputToken ? (
                    <div className="rounded-2xl bg-soft-gray-5 p-5">
                        <h3 className="text-lg font-bold text-white">Swap unavailable</h3>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-500">This coin is not available from the current Jupiter token metadata source.</p>
                        {marketUrl && <Button asChild className="mt-5 h-12 w-full rounded-full bg-white font-bold text-black hover:bg-white/85"><a href={marketUrl} target="_blank" rel="noopener noreferrer">Open market</a></Button>}
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-2xl bg-soft-gray-5">
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
            <div className="@container/coin min-w-0 flex-1 pt-header">
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
