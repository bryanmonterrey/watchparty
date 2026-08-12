"use client";

import * as React from "react";
import { subscribeCandles, type LiveBar } from "@/lib/coins/candle-stream";
import { ChartTradeMarkers, type ChartMarker, type TvWidgetLike } from "./chart-trade-markers";
import { TokenCandlestickChart } from "./token-candlestick-chart";
import { logClient } from "@/lib/client-log";

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

// The app's own palette, spelled out because the library takes hex, not CSS
// vars — it renders into an iframe that our stylesheet doesn't reach.
const UP = "#00ED89";      // lantern
const DOWN = "#FF746C";    // pastelred
const CANVAS = "#080808";  // --color-canvas, the app background
const HAIRLINE = "#18181B"; // sidebar-hover, the app's grid/divider weight
const TEXT = "#7F878E";    // pastelgray, the app's muted label colour
const MUTED = "#3F3F46";   // zinc-700 — the loading spinner, deliberately
                           // neutral. It used to run twitter2 blue, which is a
                           // royal-blue ring on an otherwise black chart and the
                           // most eye-catching thing on the page while nothing
                           // has loaded.

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


/**
 * A UDF datafeed whose history is REST and whose realtime is a push
 * subscription.
 *
 * Without a pool we can't filter a Realtime channel, so the plain UDF datafeed
 * (and its poll) is returned untouched — a chart that works on a slower refresh
 * beats no chart.
 */
function makeDatafeed(network: string, poolAddress?: string | null) {
    // Narrowed here rather than relying on the caller's guard: this function is
    // module-scope, so TypeScript can't see that the effect already checked
    // window.Datafeeds before calling. The throw is unreachable in practice —
    // the caller sets state "missing" and returns when the scripts didn't load.
    const Datafeeds = window.Datafeeds;
    if (!Datafeeds) throw new Error("charting library datafeed not loaded");

    const base = new Datafeeds.UDFCompatibleDatafeed("/api/udf", 30_000);
    if (!poolAddress) return base;

    const subs = new Map<string, () => void>();

    // Object.create keeps every method the library might call, including ones
    // added by future versions, and overrides only the two we're replacing.
    const feed = Object.create(base);

    feed.subscribeBars = (
        symbolInfo: unknown,
        resolution: string,
        onTick: (bar: LiveBar) => void,
        listenerGuid: string,
    ) => {
        subs.set(listenerGuid, subscribeCandles(network, poolAddress, resolution, onTick));
    };

    feed.unsubscribeBars = (listenerGuid: string) => {
        subs.get(listenerGuid)?.();
        subs.delete(listenerGuid);
    };

    return feed;
}

interface TokenTradingViewChartProps {
    /** Solana mint address; null/undefined for pre-launch drafts. */
    mint?: string | null;
    /** Ticker — labels a draft's empty ("No data here") chart when there's no mint. */
    ticker?: string;
    /** Chain the mint lives on. Every chain GeckoTerminal indexes charts; the
     *  network rides in the symbol (see the datafeed's parseSymbol). Defaults to
     *  Solana so existing callers keep working. */
    network?: string;
    /** Pool the candles belong to. Supplying it turns on LIVE bars — the chart
     *  subscribes to coin_candles over Realtime instead of polling. Without it
     *  the widget falls back to its own 30s refresh. */
    poolAddress?: string | null;
    /** Avatar bubbles pinned to the candles where those trades happened.
     *  Omit for a plain chart — the layer costs nothing when absent. */
    markers?: readonly ChartMarker[];
    /** Hide markers under this notional; 0 shows everything. */
    markerMinUsd?: number;
    onMarkerSelect?: (m: ChartMarker) => void;
    className?: string;
}

export function TokenTradingViewChart({
    mint,
    ticker,
    network = "solana",
    poolAddress,
    markers,
    markerMinUsd = 0,
    onMarkerSelect,
    className,
}: TokenTradingViewChartProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const widgetRef = React.useRef<TradingViewWidgetInstance | null>(null);
    const [state, setState] = React.useState<LoadState>("loading");

    // Live token → the mint drives GeckoTerminal OHLCV. Pre-launch draft → a
    // `draft-<ticker>` symbol the UDF server answers with no_data, so the widget
    // shows its native "No data here" state (like pump.fun) until first buy.
    const isDraft = !mint;
    const symbol = mint
        ? `${network}:${mint}`
        : ticker
          ? `draft-${ticker.replace(/[^a-zA-Z0-9]/g, "") || "TOKEN"}`
          : null;

    React.useEffect(() => {
        if (!symbol) return; // no mint and no ticker — nothing to chart
        let cancelled = false;
        const startedAt = Date.now();
        // Safety net: if onChartReady never fires (widget stalls on its loading
        // screen), clear the overlay anyway so the user sees the chart's own
        // state ("No data here" / candles) instead of an endless shimmer.
        //
        // Logged as "timeout", distinct from "ready": both clear the overlay, so
        // on screen they look the same — but one drew a chart and the other gave
        // up waiting, and only the log can tell them apart.
        const readyTimer = window.setTimeout(() => {
            if (cancelled) return;
            setState("ready");
            logClient("chart", { symbol, state: "timeout", ms: Date.now() - startedAt });
        }, 8000);

        (async () => {
            try {
                await Promise.all([loadScript(LIBRARY_SCRIPT), loadScript(DATAFEED_SCRIPT)]);
            } catch (err) {
                // Say WHICH script died. "missing" silently swaps in the old
                // lightweight-charts renderer, which polls a rate-limited
                // upstream — so a library problem presents as a chart that
                // loads forever, and looks identical to a data problem.
                console.error("[tv] library scripts failed to load:", err);
                logClient("chart", { symbol, state: "scripts-failed", err: String(err).slice(0, 160) });
                if (!cancelled) setState("missing");
                return;
            }
            if (cancelled) return;
            if (!window.TradingView?.widget || !window.Datafeeds?.UDFCompatibleDatafeed || !containerRef.current) {
                // Name the exact precondition rather than collapsing four very
                // different failures into one silent fallback.
                const why = {
                    TradingView: !!window.TradingView,
                    widget: !!window.TradingView?.widget,
                    Datafeeds: !!window.Datafeeds,
                    UDFCompatibleDatafeed: !!window.Datafeeds?.UDFCompatibleDatafeed,
                    container: !!containerRef.current,
                    symbol,
                };
                console.error("[tv] cannot mount widget:", why);
                logClient("chart", { state: "cannot-mount", ...why });
                setState("missing");
                return;
            }

            const widget = new window.TradingView.widget({
                symbol,
                interval: "60",
                container: containerRef.current,
                // LIVE BARS. The UDF datafeed's own realtime hook is a poll —
                // the second argument is its interval. Wrapping it lets
                // history keep coming from /api/udf while subscribeBars comes
                // from Supabase Realtime instead, so an open chart advances the
                // moment the sync writes a candle.
                //
                // Delegation by prototype rather than by hand: the library calls
                // a dozen methods on a datafeed and listing them here would
                // break silently whenever it added one.
                datafeed: makeDatafeed(network, poolAddress),
                library_path: "/charting_library/",
                locale: "en",
                theme: "dark",
                // The pane is canvas via `paneProperties`, but the top strip is
                // its own thing: `toolbar_bg` is the only knob for it, and
                // without it the chart wears a lighter band along the top edge.
                // Everything else around the canvas is themed in watchparty.css
                // through the documented --tv-color-* properties (see below).
                toolbar_bg: CANVAS,
                autosize: true,
                timezone: "Etc/UTC",
                disabled_features: ["header_symbol_search", "symbol_search_hot_key", "header_compare"],
                enabled_features: ["hide_left_toolbar_by_default"],
                // The library renders in its own iframe, so none of the app's
                // CSS reaches it — every colour has to be handed over
                // explicitly. These are the app's tokens, not TradingView's
                // dark defaults, which run blue-grey and read as a foreign
                // widget dropped into the page.
                // Relative, per the library's own docs ("a path to the static folder") —
                // it resolves against library_path. An absolute path is accepted too,
                // but relative is the documented form and can't drift if the
                // library ever moves.
                custom_css_url: "watchparty.css",
                overrides: {
                    "paneProperties.background": CANVAS,
                    "paneProperties.backgroundType": "solid",
                    "paneProperties.vertGridProperties.color": HAIRLINE,
                    "paneProperties.horzGridProperties.color": HAIRLINE,
                    "paneProperties.crossHairProperties.color": TEXT,
                    "paneProperties.legendProperties.showVolume": true,

                    "scalesProperties.backgroundColor": CANVAS,
                    "scalesProperties.lineColor": HAIRLINE,
                    "scalesProperties.textColor": TEXT,
                    "scalesProperties.fontSize": 11,

                    "mainSeriesProperties.candleStyle.upColor": UP,
                    "mainSeriesProperties.candleStyle.downColor": DOWN,
                    "mainSeriesProperties.candleStyle.wickUpColor": UP,
                    "mainSeriesProperties.candleStyle.wickDownColor": DOWN,
                    "mainSeriesProperties.candleStyle.borderUpColor": UP,
                    "mainSeriesProperties.candleStyle.borderDownColor": DOWN,

                    // Volume rides the same two colours at low alpha so it reads
                    // as context under the candles rather than a second series
                    // competing with them.
                    "volumePaneSize": "medium",
                },
                studies_overrides: {
                    "volume.volume.color.0": DOWN,
                    "volume.volume.color.1": UP,
                    "volume.volume.transparency": 75,
                },
                loading_screen: { backgroundColor: CANVAS, foregroundColor: MUTED },
            });
            widgetRef.current = widget;
            widget.onChartReady(() => {
                if (cancelled) return;
                window.clearTimeout(readyTimer);
                setState("ready");
                // The positive case matters as much as the failures: "a chart
                // rendered for this coin, in this many ms" is the only way to
                // tell a working page from one that merely stopped showing a
                // spinner.
                logClient("chart", { symbol, state: "ready", ms: Date.now() - startedAt });
            });
        })();

        return () => {
            cancelled = true;
            window.clearTimeout(readyTimer);
            try {
                widgetRef.current?.remove();
            } catch {
                /* widget may not be ready */
            }
            widgetRef.current = null;
        };
    }, [symbol]);

    if (!symbol) {
        return (
            <div className={`flex items-center justify-center text-center ${className ?? ""}`}>
                <div className="text-zinc-600 text-sm font-medium px-6">
                    Chart available once trading goes live
                </div>
            </div>
        );
    }

    // Library failed to load (network/deploy hiccup) — keep a chart on screen.
    // Live tokens fall back to the lightweight-charts renderer; a draft has no
    // real series to fall back to, so it shows the pre-launch note instead.
    if (state === "missing") {
        return isDraft ? (
            <div className={`flex items-center justify-center text-center ${className ?? ""}`}>
                <div className="text-zinc-600 text-sm font-medium px-6">
                    Chart available once trading goes live
                </div>
            </div>
        ) : (
            <TokenCandlestickChart mint={mint} className={className} />
        );
    }

    return (
        <div className={`relative ${className ?? ""}`}>
            <div ref={containerRef} className="absolute inset-0" />
            {/* Trade markers ride ON TOP of the widget's own canvas rather than
                inside it: the Charting Library has no image marker (`createShape`
                and `createExecutionShape` draw text and arrows only), so the
                avatars are DOM positioned from the chart's visible ranges. Only
                mounted once `ready`, because the ranges read as null before the
                first paint and the layer would spend its first frames hidden. */}
            {state === "ready" && markers && markers.length > 0 && (
                <ChartTradeMarkers
                    widget={widgetRef.current as unknown as TvWidgetLike | null}
                    markers={markers}
                    containerRef={containerRef}
                    minUsd={markerMinUsd}
                    onSelect={onMarkerSelect}
                />
            )}
            {state !== "ready" && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-full w-full rounded-2xl shimmer-skeleton" />
                </div>
            )}
        </div>
    );
}
