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

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-soft-gray/10 py-3 last:border-0">
            <span className="text-sm font-medium text-zinc-500">{label}</span>
            <span className="text-right text-sm font-semibold tabular-nums text-zinc-200">{value}</span>
        </div>
    );
}

function CoinIdentity({ coin }: { coin: CoinViewData }) {
    const explorer = explorerUrl(coin.network, coin.tokenAddress, coin.poolAddress);

    return (
        <aside className="border-b border-soft-gray/10 p-5 xl:border-b-0 xl:border-r">
            <div className="xl:sticky xl:top-0">
                <div className="flex items-center gap-3">
                    <div className="relative size-13 shrink-0">
                        {coin.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={coin.imageUrl} alt="" className="size-full rounded-full object-cover" />
                        ) : (
                            <div className="size-full rounded-full bg-soft-gray-10" />
                        )}
                        <ChainBadge network={coin.network} className="absolute -bottom-1 -right-1 rounded-full bg-black p-1 ring-1 ring-black" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="truncate text-xl font-bold tracking-tight text-white">{coin.name ?? coin.symbol}</h2>
                        <p className="text-sm font-semibold text-zinc-500">{coin.symbol} · {chainLabel(coin.network)}</p>
                    </div>
                </div>

                <div className="mt-6">
                    <p className="text-3xl font-semibold tracking-tight tabular-nums text-white">{compactUsd(coin.priceUsd)}</p>
                    <p className={coin.priceChange24h != null && coin.priceChange24h >= 0 ? "mt-1 text-sm font-bold text-lantern" : "mt-1 text-sm font-bold text-pastelred"}>
                        {coin.priceChange24h == null ? "—" : `${coin.priceChange24h >= 0 ? "+" : ""}${coin.priceChange24h.toFixed(2)}% 24h`}
                    </p>
                </div>

                <div className="mt-6">
                    <Stat label="Market cap" value={compactUsd(coin.marketCapUsd)} />
                    <Stat label="Liquidity" value={compactUsd(coin.liquidityUsd)} />
                    <Stat label="24h volume" value={compactUsd(coin.volume24hUsd)} />
                    <Stat label="Transactions" value={coin.txns24h?.toLocaleString() ?? "—"} />
                    <Stat label="Buys / sells" value={`${coin.buys24h?.toLocaleString() ?? "—"} / ${coin.sells24h?.toLocaleString() ?? "—"}`} />
                </div>

                <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(coin.tokenAddress)}
                    className="mt-5 flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl bg-soft-gray-5 px-3 py-3 text-left text-xs font-medium text-zinc-400 transition-colors hover:text-white"
                >
                    <span className="truncate">{coin.tokenAddress}</span>
                    <HugeiconsIcon icon={Copy01Icon} className="size-4 shrink-0" strokeWidth={2} />
                </button>

                {explorer && (
                    <a href={explorer} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-twitter2 hover:text-white">
                        View explorer
                        <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" strokeWidth={2} />
                    </a>
                )}
            </div>
        </aside>
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
        <main className="min-w-0 border-b border-soft-gray/10 xl:border-b-0">
            <div className="h-[min(58vh,620px)] min-h-[420px] bg-black">
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
 * The coin view itself — identity + stats, chart, swap — with no shell around
 * it. Exported so /coin/<mint> can render the SAME thing as a page for a coin we
 * did not launch: the overlay and that page show identical data from identical
 * sources, and there is no second implementation to drift.
 */
export function CoinDetail({ coin }: { coin: CoinViewData }) {
    return (
        <div className="grid min-h-full grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
            <CoinIdentity coin={coin} />
            <CoinChart coin={coin} />
            <CoinSwap coin={coin} />
        </div>
    );
}
