// Minimal ambient types for the self-hosted TradingView Charting Library.
// The library is NOT an npm package — it's served from /public/charting_library
// and /public/datafeeds (see docs/tradingview-charting-library.md). These cover
// only what token-tradingview-chart.tsx uses; the full lib ships its own d.ts.

interface TradingViewWidgetOptions {
    symbol: string;
    interval: string;
    container: HTMLElement;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    datafeed: any;
    library_path: string;
    locale?: string;
    theme?: "light" | "dark";
    autosize?: boolean;
    fullscreen?: boolean;
    timezone?: string;
    disabled_features?: string[];
    enabled_features?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    overrides?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loading_screen?: Record<string, any>;
    custom_css_url?: string;
}

interface TradingViewWidgetInstance {
    onChartReady(cb: () => void): void;
    remove(): void;
}

interface TradingViewWidgetConstructor {
    new (options: TradingViewWidgetOptions): TradingViewWidgetInstance;
}

interface Window {
    TradingView?: { widget: TradingViewWidgetConstructor };
    Datafeeds?: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        UDFCompatibleDatafeed: new (url: string, updateFreq?: number, opts?: any) => any;
    };
}
