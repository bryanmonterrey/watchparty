"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import { Camera01Icon, ChartCandlestickIcon, FunctionOfXIcon } from "@hugeicons/core-free-icons";
import {
    createChart,
    ColorType,
    CandlestickSeries,
    CrosshairMode,
    IChartApi,
    ISeriesApi,
    UTCTimestamp,
} from "lightweight-charts";
import { cn } from "@/lib/utils";

// Candle chart for a perp market, fed by Pyth's benchmarks TradingView shim
// (benchmarks.pyth.network — public, CORS *, no key). The same Pyth feeds
// price the Flash oracles, so the chart matches what fills settle against.
//
// Chrome mirrors the Phantom perps terminal: a slim toolbar (timeframes ·
// candle type · ƒx Indicators · camera) and a TV-style legend overlay inside
// the chart (SYMBOL · tf · source, then O H L C of the hovered candle).
// Candle-type/Indicators are decorative until the licensed TradingView
// library replaces this chart; the camera genuinely screenshots.

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

const legendFmt = (n: number) => {
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (n >= 1) return n.toFixed(2);
    if (n >= 0.01) return n.toFixed(4);
    return n.toPrecision(4);
};

export function PerpsChart({
    pythTicker,
    symbol,
    className,
}: {
    pythTicker: string;
    symbol?: string;
    className?: string;
}) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const chartRef = React.useRef<IChartApi | null>(null);
    const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
    const lastCandleRef = React.useRef<Candle | null>(null);
    const [timeframe, setTimeframe] = React.useState<Timeframe>("1H");
    const [empty, setEmpty] = React.useState(false);
    const [legend, setLegend] = React.useState<Candle | null>(null);
    // Unique per instance so two mounted charts never share a layoutId.
    const uid = React.useId();

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

        // TV-style legend: hovered candle's OHLC, falling back to the latest.
        chart.subscribeCrosshairMove((param) => {
            const d = param.seriesData.get(series) as Candle | undefined;
            setLegend(d ?? lastCandleRef.current);
        });

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
                lastCandleRef.current = candles[candles.length - 1] ?? null;
                setLegend((cur) => cur ?? lastCandleRef.current);
                if (fit) chartRef.current?.timeScale().fitContent();
            } catch {
                if (alive) setEmpty(true);
            }
        };
        lastCandleRef.current = null;
        setLegend(null);
        load(true);
        const timer = setInterval(() => load(false), 30_000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [pythTicker, timeframe]);

    const screenshot = () => {
        const canvas = chartRef.current?.takeScreenshot();
        if (!canvas) return;
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `${symbol ?? pythTicker.replace(/[^A-Za-z0-9]+/g, "-")}-chart.png`;
        a.click();
    };

    const legendUp = legend ? legend.close >= legend.open : true;
    const legendColor = legendUp ? "text-lantern" : "text-pastelred";

    return (
        <div className={className}>
            {/* Toolbar — Phantom chart chrome */}
            <div className="flex items-center gap-2.5 px-1 pb-2">
                <div className="flex items-center gap-1">
                    {TIMEFRAMES.map((tf) => (
                        <button
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            className={cn(
                                "relative z-10 cursor-pointer rounded-full px-3 py-1 text-[12px] font-bold transition-colors",
                                timeframe === tf ? "text-white" : "text-zinc-500 hover:text-zinc-300",
                            )}
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
                <span className="h-4 w-px bg-white/[0.08]" />
                <span className="text-zinc-500">
                    <HugeiconsIcon icon={ChartCandlestickIcon} className="size-4" strokeWidth={2} />
                </span>
                <span className="h-4 w-px bg-white/[0.08]" />
                <span className="flex items-center gap-1.5 text-zinc-500">
                    <HugeiconsIcon icon={FunctionOfXIcon} className="size-4" strokeWidth={2} />
                    <span className="text-[13px] font-semibold">Indicators</span>
                </span>
                <span className="ml-auto h-4 w-px bg-white/[0.08]" />
                <button
                    onClick={screenshot}
                    aria-label="Screenshot chart"
                    className="cursor-pointer text-zinc-500 transition-colors hover:text-white"
                >
                    <HugeiconsIcon icon={Camera01Icon} className="size-4" strokeWidth={2} />
                </button>
            </div>

            <div className="relative h-[280px] w-full sm:h-[420px]">
                <div ref={containerRef} className="absolute inset-0" />

                {/* TV-style legend overlay */}
                {symbol && !empty && (
                    <div className="pointer-events-none absolute left-2 top-1 z-10">
                        <p className="flex items-center gap-2 text-[15px] font-semibold text-zinc-100">
                            {symbol} · {timeframe} · watchparty
                            <span className="inline-block size-2.5 rounded-full bg-lantern/90" />
                        </p>
                        {legend && (
                            <p className={cn("mt-0.5 text-[12px] font-semibold tabular-nums", legendColor)}>
                                <span className="text-zinc-400">O</span>{legendFmt(legend.open)}{" "}
                                <span className="text-zinc-400">H</span>{legendFmt(legend.high)}{" "}
                                <span className="text-zinc-400">L</span>{legendFmt(legend.low)}{" "}
                                <span className="text-zinc-400">C</span>{legendFmt(legend.close)}
                            </p>
                        )}
                    </div>
                )}

                {empty && (
                    <p className="absolute inset-0 grid place-items-center text-[13px] font-medium text-zinc-600">
                        No chart data for this market
                    </p>
                )}
            </div>
        </div>
    );
}
