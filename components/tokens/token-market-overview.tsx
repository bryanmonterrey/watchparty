import React from "react"
import { Token } from "@/db/schema/content"
import { TokenTradingViewChart } from "./token-tradingview-chart"

interface TokenMarketOverviewProps {
    token: Token
}

export function TokenMarketOverview({ token }: TokenMarketOverviewProps) {
    const marketCap = token.marketCapUsd ?? null
    const priceChange = token.priceChange24h ?? null
    const isPositive = (priceChange ?? 0) >= 0

    const formatCurrency = (val: number) => {
        if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`
        if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`
        return `$${val.toFixed(2)}`
    }

    return (
        <div className="bg-panel rounded-[25px] p-6 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="text-zinc-500 font-bold text-xs uppercase tracking-wider mb-1">Market Cap</div>
                    <div className="flex items-baseline gap-2.5">
                        <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                            {marketCap !== null ? formatCurrency(marketCap) : "—"}
                        </span>
                        {priceChange !== null && (
                            <div className={`flex items-center gap-1 text-sm font-bold ${isPositive ? 'text-emerald-500' : 'text-pastelred'}`}>
                                <span>({isPositive ? "+" : ""}{priceChange.toFixed(2)}%)</span>
                                <span className="text-zinc-500 text-xs font-medium uppercase ml-1">24hr</span>
                            </div>
                        )}
                    </div>
                </div>

                {token.tokenAddress && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Live</span>
                    </div>
                )}
            </div>

            {/* Chart Area — TradingView Advanced Charts. Live tokens draw real
                GeckoTerminal OHLCV; pre-launch drafts show a flat baseline at
                the bonding curve's starting price (pump.fun-style). */}
            <TokenTradingViewChart
                mint={token.tokenAddress}
                ticker={token.ticker}
                className="w-full h-[320px] sm:h-[420px] bg-zinc-950/80 rounded-2xl border border-zinc-800/50 overflow-hidden"
            />
        </div>
    )
}
