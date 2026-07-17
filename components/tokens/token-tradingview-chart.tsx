"use client";

import * as React from "react";

// TradingView Charting Library wrapper — the pump.fun-style candlestick chart.
//
// The library is self-hosted (gated, not on npm): drop the files in
//   public/charting_library/   and   public/datafeeds/udf/
// per docs/tradingview-charting-library.md. Until they're present this renders
// a graceful placeholder instead of crashing. Bars come from our UDF endpoint
// (/api/udf), which is backed by GeckoTerminal OHLCV.

const LIBRARY_SCRIPT = "/charting_library/charting_library.standalone.js";
const DATAFEED_SCRIPT = "/datafeeds/udf/dist/bundle.js";

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
        s.onerror = () => reject(new Error(`failed: ${src}`));
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
                    "mainSeriesProperties.candleStyle.upColor": "#26a69a",
                    "mainSeriesProperties.candleStyle.downColor": "#ef5350",
                    "mainSeriesProperties.candleStyle.wickUpColor": "#26a69a",
                    "mainSeriesProperties.candleStyle.wickDownColor": "#ef5350",
                    "mainSeriesProperties.candleStyle.borderUpColor": "#26a69a",
                    "mainSeriesProperties.candleStyle.borderDownColor": "#ef5350",
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

    return (
        <div className={`relative ${className ?? ""}`}>
            <div ref={containerRef} className="absolute inset-0" />
            {state !== "ready" && (
                <div className="absolute inset-0 flex items-center justify-center">
                    {state === "missing" ? (
                        <div className="text-zinc-600 text-xs font-medium text-center px-6 max-w-sm">
                            Charting library not installed. Add it to{" "}
                            <code className="text-zinc-500">public/charting_library/</code> — see
                            docs/tradingview-charting-library.md
                        </div>
                    ) : (
                        <div className="h-full w-full rounded-2xl shimmer-skeleton" />
                    )}
                </div>
            )}
        </div>
    );
}
