"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
    createChart,
    ColorType,
    CandlestickSeries,
    CrosshairMode,
    IChartApi,
    ISeriesApi,
    UTCTimestamp,
} from "lightweight-charts";

// Candle chart for a perp market, fed by Pyth's benchmarks TradingView shim
// (benchmarks.pyth.network — public, CORS *, no key). The same Pyth feeds
// price the Flash oracles, so the chart matches what fills settle against.

const TIMEFRAMES = ["15m", "1H", "4H", "1D"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

/** resolution param + how far back to ask, per timeframe */
const RANGE: Record<Timeframe, { resolution: string; secondsBack: number }> = {
    "15m": { resolution: "15", secondsBack: 60 * 60 * 24 },
    "1H": { resolution: "60", secondsBack: 60 * 60 * 24 * 7 },
    "4H": { resolution: "240", secondsBack: 60 * 60 * 24 * 30 },
    "1D": { resolution: "D", secondsBack: 60 * 60 * 24 * 180 },
};

const UP = "#00ED89"; // lantern
const DOWN = "#FF746C"; // pastelred

type Candle = { time: UTCTimestamp; open: number; high: number; low: number; close: number };

async function fetchCandles(pythTicker: string, tf: Timeframe): Promise<Candle[]> {
    const { resolution, secondsBack } = RANGE[tf];
    const to = Math.floor(Date.now() / 1000);
    const from = to - secondsBack;
    const url =
        `https://benchmarks.pyth.network/v1/shims/tradingview/history` +
        `?symbol=${encodeURIComponent(pythTicker)}&resolution=${resolution}&from=${from}&to=${to}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`benchmarks ${res.status}`);
    const d: { s: string; t: number[]; o: number[]; h: number[]; l: number[]; c: number[] } = await res.json();
    if (d.s !== "ok") return [];
    return d.t.map((t, i) => ({
        time: t as UTCTimestamp,
        open: d.o[i],
        high: d.h[i],
        low: d.l[i],
        close: d.c[i],
    }));
}

export function PerpsChart({ pythTicker, className }: { pythTicker: string; className?: string }) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const chartRef = React.useRef<IChartApi | null>(null);
    const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
    const [timeframe, setTimeframe] = React.useState<Timeframe>("1H");
    const [empty, setEmpty] = React.useState(false);

    // Build the chart once.
    React.useEffect(() => {
        if (!containerRef.current) return;
        const chart = createChart(containerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: "#71717a",
                attributionLogo: false, // data is Pyth, not TradingView
            },
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
            grid: {
                vertLines: { color: "rgba(255,255,255,0.04)" },
                horzLines: { color: "rgba(255,255,255,0.04)" },
            },
            crosshair: { mode: CrosshairMode.Magnet },
            rightPriceScale: { borderVisible: false },
            timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
        });
        const series = chart.addSeries(CandlestickSeries, {
            upColor: UP,
            downColor: DOWN,
            borderVisible: false,
            wickUpColor: UP,
            wickDownColor: DOWN,
            priceFormat: { type: "price", precision: 5, minMove: 0.00001 },
        });
        chartRef.current = chart;
        seriesRef.current = series;

        const observer = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            chart.applyOptions({ width, height });
        });
        observer.observe(containerRef.current);
        return () => {
            observer.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, []);

    // Load + poll candles for the active market/timeframe.
    React.useEffect(() => {
        let alive = true;
        const load = async (fit: boolean) => {
            try {
                const candles = await fetchCandles(pythTicker, timeframe);
                if (!alive || !seriesRef.current) return;
                setEmpty(candles.length === 0);
                // Tighten decimals to the market's magnitude (BONK vs BTC).
                const last = candles[candles.length - 1]?.close ?? 1;
                const precision = last >= 100 ? 2 : last >= 1 ? 4 : last >= 0.001 ? 6 : 10;
                seriesRef.current.applyOptions({
                    priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision },
                });
                seriesRef.current.setData(candles);
                if (fit) chartRef.current?.timeScale().fitContent();
            } catch {
                if (alive) setEmpty(true);
            }
        };
        load(true);
        const timer = setInterval(() => load(false), 30_000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [pythTicker, timeframe]);

    // Unique per instance so two mounted charts never share a layoutId.
    const uid = React.useId();

    return (
        <div className={className}>
            <div className="flex items-center gap-1 px-1 pb-2">
                {TIMEFRAMES.map((tf) => (
                    <button
                        key={tf}
                        onClick={() => setTimeframe(tf)}
                        className={
                            "relative z-10 cursor-pointer rounded-full px-3 py-1 text-[12px] font-bold transition-colors " +
                            (timeframe === tf ? "text-white" : "text-zinc-500 hover:text-zinc-300")
                        }
                    >
                        {tf}
                        {timeframe === tf && (
                            <motion.div
                                layoutId={`perpsTf-${uid}`}
                                className="absolute inset-0 -z-10 rounded-full bg-white/10"
                                initial={false}
                                transition={{ type: "spring", stiffness: 250, damping: 30 }}
                            />
                        )}
                    </button>
                ))}
            </div>
            <div className="relative h-[280px] w-full sm:h-[360px]">
                <div ref={containerRef} className="absolute inset-0" />
                {empty && (
                    <p className="absolute inset-0 grid place-items-center text-[13px] font-medium text-zinc-600">
                        No chart data for this market
                    </p>
                )}
            </div>
        </div>
    );
}
