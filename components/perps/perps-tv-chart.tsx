"use client";

import * as React from "react";
import { loadScript } from "@/components/tokens/token-tradingview-chart";
import { PerpsChart } from "@/components/perps/perps-chart";

// TradingView Advanced Charts for perps — same self-hosted library as the
// token page, but fed by Pyth's UDF-compatible TradingView shim via our
// caching proxy (/api/pyth-udf), the exact feed Flash fills settle against.
// If the licensed library files aren't installed, falls back to the
// lightweight-charts PerpsChart so the terminal always has a chart.

const LIBRARY_SCRIPT = "/charting_library/charting_library.standalone.js";
const DATAFEED_SCRIPT = "/datafeeds/udf/dist/bundle.js";
const PYTH_UDF = "/api/pyth-udf";

const UP = "#00ED89"; // lantern
const DOWN = "#FF746C"; // pastelred

type LoadState = "loading" | "ready" | "missing";

export function PerpsTVChart({
    pythTicker,
    symbol,
    height,
    className,
}: {
    pythTicker: string;
    symbol?: string;
    /** Chart-area height in px (drag-resizable); defaults to responsive classes. */
    height?: number;
    className?: string;
}) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const widgetRef = React.useRef<TradingViewWidgetInstance | null>(null);
    const [state, setState] = React.useState<LoadState>("loading");

    React.useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                await Promise.all([loadScript(LIBRARY_SCRIPT), loadScript(DATAFEED_SCRIPT)]);
            } catch {
                if (!cancelled) setState("missing");
                return;
            }
            if (cancelled) return;
            if (!window.TradingView?.widget || !window.Datafeeds?.UDFCompatibleDatafeed || !containerRef.current) {
                setState("missing");
                return;
            }

            const widget = new window.TradingView.widget({
                symbol: pythTicker,
                interval: "15",
                container: containerRef.current,
                datafeed: new window.Datafeeds.UDFCompatibleDatafeed(PYTH_UDF, 10_000),
                library_path: "/charting_library/",
                locale: "en",
                theme: "dark",
                autosize: true,
                timezone: "Etc/UTC",
                disabled_features: ["header_symbol_search", "symbol_search_hot_key", "header_compare"],
                enabled_features: ["hide_left_toolbar_by_default"],
                loading_screen: { backgroundColor: "transparent" },
                overrides: {
                    "paneProperties.background": "#0d0d0d",
                    "paneProperties.backgroundType": "solid",
                    "mainSeriesProperties.candleStyle.upColor": UP,
                    "mainSeriesProperties.candleStyle.downColor": DOWN,
                    "mainSeriesProperties.candleStyle.wickUpColor": UP,
                    "mainSeriesProperties.candleStyle.wickDownColor": DOWN,
                    "mainSeriesProperties.candleStyle.borderUpColor": UP,
                    "mainSeriesProperties.candleStyle.borderDownColor": DOWN,
                },
            });
            widgetRef.current = widget;
            widget.onChartReady(() => {
                if (!cancelled) setState("ready");
            });
        })();

        return () => {
            cancelled = true;
            try {
                widgetRef.current?.remove();
            } catch {
                /* widget may not be ready */
            }
            widgetRef.current = null;
        };
    }, [pythTicker]);

    if (state === "missing") {
        return <PerpsChart pythTicker={pythTicker} symbol={symbol} height={height} className={className} />;
    }

    return (
        <div className={className}>
            <div
                className={height ? "relative w-full" : "relative h-[280px] w-full sm:h-[420px]"}
                style={height ? { height } : undefined}
            >
                <div ref={containerRef} className="absolute inset-0" />
                {state !== "ready" && (
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="size-full shimmer-skeleton" />
                    </div>
                )}
            </div>
        </div>
    );
}
