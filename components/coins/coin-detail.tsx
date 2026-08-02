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

/** One cell in the header's stat strip. Label above, value below — the strip is
 *  a row of these, which is what lets it scan horizontally instead of being a
 *  list you read top to bottom. */
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="flex min-w-0 shrink-0 flex-col justify-center border-l border-soft-gray/10 px-4 py-2 first:border-l-0 first:pl-0">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
            <span className={cn("truncate text-[15px] font-bold tabular-nums", tone ?? "text-white")}>{value}</span>
        </div>
    );
}

/**
 * The coin's header — identity on the left, a horizontal strip of market stats
 * beside it, spanning the full width above the chart.
 *
 * A HEADER, not a column. It used to be a 280px sidebar with the stats stacked
 * vertically down it, which cost the chart a fifth of the page to show six
 * numbers — and the chart is the thing anyone came for. Every board that does
 * this well (Dexscreener, Birdeye, GMGN) puts identity and stats in a bar and
 * gives the rest of the surface to the chart.
 *
 * The strip scrolls horizontally rather than wrapping: at a narrow width a
 * wrapped strip pushes the chart down the page, and these read as one row.
 */
function CoinHeader({ coin }: { coin: CoinViewData }) {
    const explorer = explorerUrl(coin.network, coin.tokenAddress, coin.poolAddress);
    const up = coin.priceChange24h != null && coin.priceChange24h >= 0;

    return (
        <header className="flex min-w-0 flex-col gap-3 border-b border-soft-gray/10 px-4 py-3 @3xl/coin:flex-row @3xl/coin:items-center @3xl/coin:gap-5">
            {/* Identity. shrink-0 so the stat strip gives way first — the coin's
                own name is the last thing that should be squeezed. */}
            <div className="flex min-w-0 shrink-0 items-center gap-3">
                <div className="relative size-10 shrink-0">
                    {coin.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coin.imageUrl} alt="" className="size-full rounded-full object-cover" />
                    ) : (
                        <div className="size-full rounded-full bg-soft-gray-10" />
                    )}
                    <ChainBadge network={coin.network} className="absolute -bottom-1 -right-1 rounded-full bg-black p-1 ring-1 ring-black" />
                </div>
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-bold tracking-tight text-white">{coin.symbol}</h1>
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-zinc-500">
                            {coin.name ?? chainLabel(coin.network)}
                        </span>
                        {/* The address belongs up here next to the name, as a
                            copy affordance — it was a full-width button at the
                            bottom of the old sidebar, which is a lot of room for
                            a string nobody reads. */}
                        <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(coin.tokenAddress)}
                            aria-label="copy token address"
                            className="flex shrink-0 cursor-pointer items-center gap-1 text-[13px] font-medium text-zinc-600 transition-colors hover:text-white"
                        >
                            <span className="hidden @xl/coin:inline">
                                {coin.tokenAddress.slice(0, 4)}…{coin.tokenAddress.slice(-4)}
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

            <div className="hidden-scrollbar -mx-1 flex min-w-0 items-stretch overflow-x-auto px-1">
                <Stat label="Price" value={compactUsd(coin.priceUsd)} />
                <Stat
                    label="24h"
                    value={coin.priceChange24h == null ? "—" : `${up ? "+" : ""}${coin.priceChange24h.toFixed(2)}%`}
                    tone={coin.priceChange24h == null ? "text-zinc-500" : up ? "text-lantern" : "text-pastelred"}
                />
                <Stat label="Market cap" value={compactUsd(coin.marketCapUsd)} />
                <Stat label="Liquidity" value={compactUsd(coin.liquidityUsd)} />
                <Stat label="24h vol" value={compactUsd(coin.volume24hUsd)} />
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
        <aside className="p-4 xl:border-l xl:border-soft-gray/10">
            <div className="xl:sticky xl:top-0">
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
 * The coin view — a header, the chart under it, and the swap panel beside both.
 *
 * TWO columns, not three. The header used to be a 280px identity SIDEBAR with
 * the stats stacked down it, which spent a fifth of the page on six numbers and
 * took that width from the chart. Identity and stats belong in a bar; the
 * surface belongs to the chart.
 *
 * @container/coin rather than viewport breakpoints: this renders inside a
 * column that's already narrowed by the alerts rail and the action dock, so
 * `xl:` here would measure width this component doesn't own.
 */
export function CoinDetail({ coin }: { coin: CoinViewData }) {
    return (
        <div className="@container/coin grid min-h-full grid-cols-1 @5xl/coin:grid-cols-[minmax(0,1fr)_360px]">
            {/* Header + chart are one column; the swap panel is the other. */}
            <div className="flex min-w-0 flex-col">
                <CoinHeader coin={coin} />
                <CoinChart coin={coin} />
            </div>
            <CoinSwap coin={coin} />
        </div>
    );
}
