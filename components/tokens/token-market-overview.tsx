import React, { useState } from "react"
import { Token } from "@/db/schema/content"

interface TokenMarketOverviewProps {
    token: Token
}

export function TokenMarketOverview({ token }: TokenMarketOverviewProps) {
    const [selectedTimeframe, setSelectedTimeframe] = useState("1h")

    // Calculations based on token data, with mockup values as clean defaults
    const marketCap = token.marketCapUsd || 126000
    const priceChange = token.priceChange24h !== null && token.priceChange24h !== undefined ? token.priceChange24h : 369.32
    const isPositive = priceChange >= 0
    
    // Absolute change calculation helper
    const absoluteChange = Math.abs(marketCap * (priceChange / 100) / (1 + (priceChange / 100)))
    const ath = Math.max(marketCap * 1.05, 132000)
    const progressWidth = Math.min(100, Math.max(10, Math.round((marketCap / ath) * 100)))

    const timeframes = ["1m", "5m", "15m", "1h", "4h", "1D"]

    // Beautiful SVG chart path coordinates for mockup visual chart
    const chartPath = "M 0 350 Q 80 320 160 360 T 320 220 T 480 280 T 640 120 T 800 160 T 960 50"
    const chartAreaPath = `${chartPath} L 960 400 L 0 400 Z`

    const formatCurrency = (val: number) => {
        if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`
        if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`
        return `$${val.toFixed(2)}`
    }

    return (
        <div className="bg-card rounded-[25px] p-6 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="text-zinc-500 font-bold text-xs uppercase tracking-wider mb-1">Market Cap</div>
                    <div className="flex items-baseline gap-2.5">
                        <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                            {formatCurrency(marketCap)}
                        </span>
                        <div className={`flex items-center gap-1 text-sm font-bold ${isPositive ? 'text-emerald-500' : 'text-pastelred'}`}>
                            <span>{isPositive ? "+" : "-"}{formatCurrency(absoluteChange)}</span>
                            <span>({isPositive ? "+" : ""}{priceChange.toFixed(2)}%)</span>
                            <span className="text-zinc-500 text-xs font-medium uppercase ml-1">24hr</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 self-stretch sm:self-auto">
                    <div className="flex items-center justify-between sm:justify-end gap-3 text-sm font-semibold w-full sm:w-auto">
                        <span className="text-zinc-500">ATH</span>
                        <span className="text-zinc-300 font-extrabold">{formatCurrency(ath)}</span>
                    </div>
                    <div className="w-full sm:w-56 h-2 bg-zinc-800/80 rounded-full overflow-hidden flex border border-zinc-700/20">
                        <div 
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                            style={{ width: `${progressWidth}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            {/* Timeframe Selectors & Chart Header */}
            <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                <div className="flex bg-zinc-950/80 p-0.5 rounded-full border border-zinc-800">
                    {timeframes.map((tf) => (
                        <button
                            key={tf}
                            onClick={() => setSelectedTimeframe(tf)}
                            className={`cursor-pointer px-3.5 py-1 text-xs font-bold rounded-full transition-all ${
                                selectedTimeframe === tf
                                    ? "bg-zinc-800 text-white shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-300"
                            }`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Live data streaming</span>
                </div>
            </div>

            {/* Chart Area */}
            <div className="w-full h-[320px] sm:h-[380px] bg-zinc-950/80 rounded-2xl border border-zinc-800/50 flex items-center justify-center relative overflow-hidden">
                {/* Grid Background */}
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
                
                {/* SVG Live-like Chart Render */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 960 400" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                        </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    <line x1="0" y1="100" x2="960" y2="100" stroke="#27272a" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
                    <line x1="0" y1="200" x2="960" y2="200" stroke="#27272a" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
                    <line x1="0" y1="300" x2="960" y2="300" stroke="#27272a" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />

                    {/* Gradient Fill under Path */}
                    <path d={chartAreaPath} fill="url(#chartGradient)" />

                    {/* Green Line Path */}
                    <path d={chartPath} fill="none" stroke="#10B981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Last Point Ring Indicator */}
                    <circle cx="960" cy="50" r="10" fill="#10B981" fillOpacity="0.2" className="animate-ping" style={{ transformOrigin: '960px 50px' }} />
                    <circle cx="960" cy="50" r="5" fill="#10B981" />
                </svg>

                {/* Hover overlay/tooltip mockup elements */}
                <div className="absolute top-5 right-5 bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-lg text-xxs font-bold text-zinc-400 flex flex-col gap-0.5 shadow-lg backdrop-blur-sm pointer-events-none">
                    <div className="flex items-center justify-between gap-4">
                        <span>Price:</span>
                        <span className="text-zinc-200">${(marketCap / 1000000000).toFixed(8)} SOL</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <span>Vol 24h:</span>
                        <span className="text-zinc-200">$205K</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
