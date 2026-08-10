"use client";

import * as React from "react";
import {
    createChart,
    ColorType,
    CandlestickSeries,
    HistogramSeries,
    CrosshairMode,
    IChartApi,
    ISeriesApi,
    UTCTimestamp,
} from "lightweight-charts";
import { trpc } from "@/lib/trpc/client";
import { retryTransient } from "@/lib/query-retry";

// Pump.fun-style candlestick chart on lightweight-charts (v5). Candles on the
// main scale, a volume histogram overlaid in the bottom ~22%, an OHLC legend
// that tracks the crosshair, and a timeframe row. Data comes from
// wallet.getChartData (GeckoTerminal OHLCV).

const TIMEFRAMES = ["1H", "1D", "1W", "1M", "YTD", "ALL"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const UP = "#26a69a";
const DOWN = "#ef5350";

interface TokenCandlestickChartProps {
    mint?: string | null;
    className?: string;
}

export function TokenCandlestickChart({ mint, className }: TokenCandlestickChartProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const chartRef = React.useRef<IChartApi | null>(null);
    const candleRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeRef = React.useRef<ISeriesApi<"Histogram"> | null>(null);
    const [timeframe, setTimeframe] = React.useState<Timeframe>("1D");
    const [legend, setLegend] = React.useState<{ o: number; h: number; l: number; c: number } | null>(null);

    const { data: chartData = [], isLoading } = trpc.wallet.getChartData.useQuery(
        { mint: mint!, timeframe },
        { enabled: !!mint, staleTime: 60_000, refetchInterval: 60_000, retry: retryTransient(1) }
    );

    // Build the chart once.
    React.useEffect(() => {
        if (!mint || !containerRef.current) return;

        const chart = createChart(containerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: "#71717a",
                // Satisfies the lightweight-charts attribution requirement (small
                // TradingView logo linking to tradingview.com) — no separate credit needed.
                attributionLogo: true,
            },
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
            grid: {
                vertLines: { color: "rgba(255,255,255,0.04)" },
                horzLines: { color: "rgba(255,255,255,0.04)" },
            },
            rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.25 } },
            timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
            crosshair: { mode: CrosshairMode.Normal },
        });

        const candle = chart.addSeries(CandlestickSeries, {
            upColor: UP,
            downColor: DOWN,
            wickUpColor: UP,
            wickDownColor: DOWN,
            borderUpColor: UP,
            borderDownColor: DOWN,
        });

        const volume = chart.addSeries(HistogramSeries, {
            priceFormat: { type: "volume" },
            priceScaleId: "", // overlay on its own invisible scale
        });
        volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

        chart.subscribeCrosshairMove((param) => {
            const d = param.seriesData.get(candle) as
                | { open: number; high: number; low: number; close: number }
                | undefined;
            setLegend(d ? { o: d.open, h: d.high, l: d.low, c: d.close } : null);
        });

        chartRef.current = chart;
        candleRef.current = candle;
        volumeRef.current = volume;

        const onResize = () => {
            if (containerRef.current) {
                chart.applyOptions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            }
        };
        window.addEventListener("resize", onResize);

        return () => {
            window.removeEventListener("resize", onResize);
            chart.remove();
            chartRef.current = null;
            candleRef.current = null;
            volumeRef.current = null;
        };
    }, [mint]);

    // Push data whenever it changes.
    React.useEffect(() => {
        if (!candleRef.current || !volumeRef.current || chartData.length === 0) return;

        candleRef.current.setData(
            chartData.map((d) => ({
                time: d.time as UTCTimestamp,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
            }))
        );
        volumeRef.current.setData(
            chartData.map((d) => ({
                time: d.time as UTCTimestamp,
                value: d.volume ?? 0,
                color: d.close >= d.open ? "rgba(38,166,154,0.45)" : "rgba(239,83,80,0.45)",
            }))
        );
        chartRef.current?.timeScale().fitContent();
    }, [chartData]);

    if (!mint) {
        return (
            <div className={`flex items-center justify-center text-center ${className ?? ""}`}>
                <div className="text-zinc-600 text-sm font-medium px-6">
                    Chart available once trading goes live
                </div>
            </div>
        );
    }

    const fmt = (v: number) =>
        v < 0.0001 ? v.toExponential(2) : v < 1 ? v.toFixed(6) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const noData = !isLoading && chartData.length === 0;

    return (
        <div className={`relative flex flex-col ${className ?? ""}`}>
            {/* OHLC legend */}
            {legend && (
                <div className="absolute top-2 left-3 z-10 flex gap-2.5 text-[11px] font-bold pointer-events-none">
                    <span className="text-zinc-400">O <span className="text-zinc-200">{fmt(legend.o)}</span></span>
                    <span className="text-zinc-400">H <span className="text-emerald-400">{fmt(legend.h)}</span></span>
                    <span className="text-zinc-400">L <span className="text-pastelred">{fmt(legend.l)}</span></span>
                    <span className="text-zinc-400">C <span className="text-zinc-200">{fmt(legend.c)}</span></span>
                </div>
            )}

            <div ref={containerRef} className="flex-1 w-full" />

            {isLoading && (
                <div className="absolute inset-0 rounded-2xl shimmer-skeleton" />
            )}
            {noData && (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm">
                    No chart data yet
                </div>
            )}

            {/* Timeframe row */}
            <div className="flex items-center gap-1 px-1 pt-2 shrink-0">
                {TIMEFRAMES.map((tf) => (
                    <button
                        key={tf}
                        onClick={() => setTimeframe(tf)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                            timeframe === tf
                                ? "bg-zinc-800 text-white"
                                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                    >
                        {tf}
                    </button>
                ))}
            </div>
        </div>
    );
}
