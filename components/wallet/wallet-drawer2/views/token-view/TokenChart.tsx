"use client";

import * as React from "react";
import {
    createChart,
    ColorType,
    AreaSeries,
    IChartApi,
    LineStyle,
    ISeriesApi,
    IPriceLine,
    UTCTimestamp,
} from "lightweight-charts";
import { Token } from "../../types";
import { trpc } from "@/lib/trpc/client";
import { retryTransient } from "@/lib/query-retry";

interface TokenChartProps {
    token: Token;
    onHoverPrice?: (price: number | null) => void;
    onPeriodStart?: (price: number) => void;
}

const TIMEFRAMES = ["1H", "1D", "1W", "1M", "YTD", "ALL"];


function formatTooltipTime(timestamp: number, timeframe: string): string {
    const date = new Date(timestamp * 1000);
    if (timeframe === "1H" || timeframe === "1D" || timeframe === "1W") {
        return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    }
    if (timeframe === "ALL") {
        return date.toLocaleDateString([], { month: "short", year: "numeric" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function TokenChart({ token, onHoverPrice, onPeriodStart }: TokenChartProps) {
    const chartContainerRef = React.useRef<HTMLDivElement>(null);
    const chartRef = React.useRef<IChartApi | null>(null);
    const tooltipRef = React.useRef<HTMLDivElement>(null);
    const activeSeriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
    const inactiveSeriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
    const allDataRef = React.useRef<{ time: UTCTimestamp; value: number }[]>([]);
    const baselineRef = React.useRef<IPriceLine | null>(null);
    const onHoverPriceRef = React.useRef(onHoverPrice);
    const onPeriodStartRef = React.useRef(onPeriodStart);
    const activeTimeframeRef = React.useRef("1D");
    const rafRef = React.useRef<number | null>(null);
    const [activeTimeframe, setActiveTimeframe] = React.useState("1D");

    const { data: chartData, isLoading: isLoadingChart } = trpc.wallet.getChartData.useQuery(
        { mint: token.mint, timeframe: activeTimeframe },
        { staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000, retry: retryTransient(1) }
    );
    const hasNoData = !isLoadingChart && (!chartData || chartData.length === 0);

    React.useEffect(() => { onHoverPriceRef.current = onHoverPrice; }, [onHoverPrice]);
    React.useEffect(() => { onPeriodStartRef.current = onPeriodStart; }, [onPeriodStart]);
    React.useEffect(() => { activeTimeframeRef.current = activeTimeframe; }, [activeTimeframe]);

    // Create chart once on mount
    React.useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: "#71717a",
                attributionLogo: false,
            },
            width: chartContainerRef.current.clientWidth,
            height: 200,
            grid: { vertLines: { visible: false }, horzLines: { visible: false } },
            rightPriceScale: { visible: false },
            leftPriceScale: { visible: false },
            timeScale: { visible: false, borderVisible: false },
            crosshair: {
                vertLine: {
                    color: "rgba(255, 255, 255, 0.2)",
                    width: 1,
                    style: LineStyle.Solid,
                    labelVisible: false,
                },
                horzLine: { visible: false, labelVisible: false },
            },
            handleScroll: false,
            handleScale: false,
        });

        // Gray series — ALWAYS holds full data so the price scale never jumps.
        // Renders behind green. Visible only on the right portion during hover.
        const inactiveSeries = chart.addSeries(AreaSeries, {
            lineColor: "#4B4B4B",
            topColor: "rgba(75, 75, 75, 0.05)",
            bottomColor: "rgba(75, 75, 75, 0.0)",
            lineWidth: 3,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
        });

        // Green series — renders on top, trimmed to the left portion while hovering.
        const activeSeries = chart.addSeries(AreaSeries, {
            lineColor: "#00ED89", // --color-lantern
            topColor: "rgba(0, 237, 137, 0.2)",
            bottomColor: "rgba(0, 237, 137, 0.0)",
            lineWidth: 3,
            priceLineVisible: false,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 5,
            lastValueVisible: false,
        });

        activeSeriesRef.current = activeSeries;
        inactiveSeriesRef.current = inactiveSeries;
        chartRef.current = chart;

        chart.subscribeCrosshairMove((param) => {
            if (!tooltipRef.current || !chartContainerRef.current) return;

            // Batch updates to one per animation frame — prevents flickering
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                if (!tooltipRef.current || !chartContainerRef.current) return;

                const outOfBounds =
                    !param.time ||
                    param.point === undefined ||
                    param.point.x < 0 ||
                    param.point.x > chartContainerRef.current.clientWidth ||
                    param.point.y < 0 ||
                    param.point.y > chartContainerRef.current.clientHeight;

                if (outOfBounds) {
                    tooltipRef.current.style.opacity = "0";
                    activeSeriesRef.current?.setData(allDataRef.current);
                    onHoverPriceRef.current?.(null);
                    return;
                }

                // Tooltip label
                tooltipRef.current.style.opacity = "1";
                tooltipRef.current.textContent = formatTooltipTime(
                    param.time as number,
                    activeTimeframeRef.current
                );
                const tw = tooltipRef.current.clientWidth;
                const cw = chartContainerRef.current.clientWidth;
                tooltipRef.current.style.left = `${Math.max(0, Math.min(cw - tw, param.point!.x - tw / 2))}px`;

                // Find the split point (>= handles any float drift)
                const hoverTime = param.time as number;
                const idx = allDataRef.current.findIndex((d) => (d.time as number) >= hoverTime);
                if (idx === -1) return;

                // Only trim the green series — gray stays full, keeping scale locked
                activeSeriesRef.current?.setData(allDataRef.current.slice(0, idx + 1));
                onHoverPriceRef.current?.(allDataRef.current[idx].value);
            });
        });

        const container = chartContainerRef.current;
        const onLeave = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
            activeSeriesRef.current?.setData(allDataRef.current);
            onHoverPriceRef.current?.(null);
        };
        container.addEventListener("mouseleave", onLeave);

        // Forward wheel events to the nearest scrollable parent so the chart
        // doesn't block page scrolling (lightweight-charts eats wheel events
        // even when handleScroll is false).
        const onWheel = (e: WheelEvent) => {
            let el: HTMLElement | null = container.parentElement;
            while (el) {
                const { overflowY } = window.getComputedStyle(el);
                if (overflowY === "auto" || overflowY === "scroll") {
                    el.scrollTop += e.deltaY;
                    break;
                }
                el = el.parentElement;
            }
        };
        container.addEventListener("wheel", onWheel, { passive: true });

        const onResize = () =>
            chartRef.current?.applyOptions({ width: chartContainerRef.current!.clientWidth });
        window.addEventListener("resize", onResize);

        return () => {
            window.removeEventListener("resize", onResize);
            container.removeEventListener("mouseleave", onLeave);
            container.removeEventListener("wheel", onWheel);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            chart.remove();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear chart when switching to a timeframe that hasn't loaded yet
    React.useEffect(() => {
        if (!activeSeriesRef.current || !inactiveSeriesRef.current) return;
        if (chartData && chartData.length > 0) return; // already have data, no flash needed
        activeSeriesRef.current.setData([]);
        inactiveSeriesRef.current.setData([]);
        allDataRef.current = [];
        if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
        onHoverPriceRef.current?.(null);
    }, [activeTimeframe, chartData]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reload chart whenever real data arrives
    React.useEffect(() => {
        if (!activeSeriesRef.current || !inactiveSeriesRef.current || !chartRef.current) return;
        if (!chartData || chartData.length === 0) return;

        const typed = chartData.map(d => ({ time: d.time as UTCTimestamp, value: d.value }));
        allDataRef.current = typed;

        inactiveSeriesRef.current.setData(typed);
        activeSeriesRef.current.setData(typed);

        if (baselineRef.current) {
            baselineRef.current.applyOptions({ price: chartData[0].value });
        } else {
            baselineRef.current = inactiveSeriesRef.current.createPriceLine({
                price: chartData[0].value,
                color: "rgba(255, 255, 255, 0.15)",
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: false,
                title: "",
            });
        }

        if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
        onHoverPriceRef.current?.(null);
        onPeriodStartRef.current?.(chartData[0].value);

        chartRef.current.timeScale().fitContent();
    }, [chartData]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="w-full relative">
            <div
                ref={tooltipRef}
                className="pointer-events-none absolute z-10 px-2 py-1 text-11 font-semibold text-zinc-500 transition-opacity duration-200"
                style={{ opacity: 0 }}
            />
            {hasNoData && !isLoadingChart && (
                <div className="absolute inset-0 flex h-[200px] items-center justify-center text-12 font-medium text-zinc-600">
                    No chart data yet
                </div>
            )}
            {/* Keep the chart container mounted at all times so the chart library
                can attach to its ref; overlay a shimmer placeholder while loading. */}
            <div ref={chartContainerRef} className="w-full h-[200px]" style={{ touchAction: "pan-y" }} />
            {isLoadingChart && (
                <div className="absolute top-0 left-0 right-0 h-[200px] rounded-2xl shimmer-skeleton" />
            )}
            <div className="flex items-center justify-between px-5 mt-2">
                {TIMEFRAMES.map((tf) => (
                    <button
                        key={tf}
                        onClick={() => setActiveTimeframe(tf)}
                        // Pill, matching the tab strip on the main view — this
                        // was the drawer's only rounded-lg control.
                        className={[
                            "cursor-pointer rounded-full px-3 py-1.5 text-12 font-bold transition-colors",
                            activeTimeframe === tf
                                ? "bg-white/[0.08] text-white"
                                : "text-zinc-500 hover:text-white",
                        ].join(" ")}
                    >
                        {tf}
                    </button>
                ))}
            </div>
        </div>
    );
}
