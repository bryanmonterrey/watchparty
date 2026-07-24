"use client";

import * as React from "react";
import { TokenCandlestickChart } from "./token-candlestick-chart";

// TradingView Charting Library wrapper — the pump.fun-style candlestick chart.
//
// The library is self-hosted (gated, not on npm): the files live in
//   public/charting_library/   and   public/datafeeds/udf/
// per docs/tradingview-charting-library.md. If they ever fail to load this
// falls back to the lightweight-charts TokenCandlestickChart instead of
// crashing. Bars come from our UDF endpoint (/api/udf), backed by
// GeckoTerminal OHLCV.

const LIBRARY_SCRIPT = "/charting_library/charting_library.standalone.js";
const DATAFEED_SCRIPT = "/datafeeds/udf/dist/bundle.js";

const UP = "#00ED89"; // lantern
const DOWN = "#FF746C"; // pastelred

type LoadState = "loading" | "ready" | "missing";

export function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === "true") return resolve();
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () => reject(new Error(`failed: ${src}`)));
            return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => {
            s.dataset.loaded = "true";
            resolve();
        };
        s.onerror = () => {
            // Remove the failed tag so a later attempt re-tries instead of
            // finding a dead element and waiting forever for its load event.
            s.remove();
            reject(new Error(`failed: ${src}`));
        };
        document.head.appendChild(s);
    });
}

interface TokenTradingViewChartProps {
    /** Solana mint address; null/undefined for pre-launch drafts. */
    mint?: string | null;
    name?: string;
    className?: string;
}

export function TokenTradingViewChart({ mint, name, className }: TokenTradingViewChartProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const widgetRef = React.useRef<TradingViewWidgetInstance | null>(null);
    const [state, setState] = React.useState<LoadState>("loading");

    React.useEffect(() => {
        if (!mint) return; // draft token — handled by the no-mint branch below
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
                symbol: mint,
                interval: "60",
                container: containerRef.current,
                datafeed: new window.Datafeeds.UDFCompatibleDatafeed("/api/udf", 30_000),
                library_path: "/charting_library/",
                locale: "en",
                theme: "dark",
                autosize: true,
                timezone: "Etc/UTC",
                disabled_features: ["header_symbol_search", "symbol_search_hot_key", "header_compare"],
                enabled_features: ["hide_left_toolbar_by_default"],
                loading_screen: { backgroundColor: "transparent" },
                overrides: {
                    "paneProperties.background": "#0a0a0a",
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
    }, [mint, name]);

    if (!mint) {
        return (
            <div className={`flex items-center justify-center text-center ${className ?? ""}`}>
                <div className="text-zinc-600 text-sm font-medium px-6">
                    Chart available once trading goes live
                </div>
            </div>
        );
    }

    // Library failed to load (network/deploy hiccup) — keep a chart on screen
    // via the lightweight-charts renderer rather than an error state.
    if (state === "missing") {
        return <TokenCandlestickChart mint={mint} className={className} />;
    }

    return (
        <div className={`relative ${className ?? ""}`}>
            <div ref={containerRef} className="absolute inset-0" />
            {state !== "ready" && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-full w-full rounded-2xl shimmer-skeleton" />
                </div>
            )}
        </div>
    );
}
