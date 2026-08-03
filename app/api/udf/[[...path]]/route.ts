import { type NextRequest, NextResponse } from "next/server";
import { getUdfBars, parseSymbol, SUPPORTED_RESOLUTIONS } from "@/lib/tokens/udf-datafeed";

// UDF (Universal Data Feed) REST server for the TradingView Charting Library.
// `Datafeeds.UDFCompatibleDatafeed("/api/udf")` calls:
//   GET /api/udf/config   GET /api/udf/symbols?symbol=<mint>
//   GET /api/udf/history?symbol=<mint>&resolution=&from=&to=&countback=
//   GET /api/udf/time
// For a LIVE token the symbol is the Solana mint (OHLCV from GeckoTerminal).
// For a PRE-LAUNCH draft the symbol is `draft-<ticker>` — there's no pool yet,
// so /history returns no_data and the widget shows its native "No data here"
// empty state (the pump.fun behaviour). We do NOT synthesise a flat baseline:
// a zero-range series (every bar o=h=l=c) can stall the chart's price-scale
// init so onChartReady never fires and the loading screen spins forever.

const DRAFT_PREFIX = "draft-";
const isDraftSymbol = (s: string) => s.toLowerCase().startsWith(DRAFT_PREFIX);

const json = (data: unknown, init?: ResponseInit) =>
    NextResponse.json(data, { headers: { "Cache-Control": "no-store" }, ...init });

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ path?: string[] }> },
) {
    const { path } = await params;
    const endpoint = path?.[0] ?? "";
    const q = req.nextUrl.searchParams;

    switch (endpoint) {
        case "config":
            return json({
                supported_resolutions: SUPPORTED_RESOLUTIONS,
                supports_group_request: false,
                supports_marks: false,
                // MUST be true. `supports_search: false` together with
                // `supports_group_request: false` is the one combination
                // UDFCompatibleDatafeed refuses: it throws "Unsupported datafeed
                // configuration. Must either support search, or support group
                // request" from its constructor, before requesting /symbols or
                // /history. That is why no chart has EVER rendered — the widget
                // died on /config every time, which looked identical to a data
                // problem and sent several rounds of debugging at the data.
                //
                // The two flags describe how the datafeed resolves symbols:
                // group_request means "hand me every symbol up front", search
                // means "I'll resolve them one at a time via /symbols". We serve
                // /symbols per-symbol, so search is the accurate answer — and
                // there are billions of tokens, so group request could never be.
                //
                // Independent of the widget's `header_symbol_search` feature
                // flag, which only hides the search UI. This is a datafeed
                // capability, not a piece of chrome.
                supports_search: true,
                supports_timescale_marks: false,
                supports_time: true,
            });

        case "time":
            return new NextResponse(String(Math.floor(Date.now() / 1000)), {
                headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
            });

        // Declaring supports_search means the library may call /search. It
        // won't here — header_symbol_search is disabled and the symbol is always
        // supplied by the page — but an unhandled route would 404, and a 404 on
        // a declared capability is exactly the kind of thing that surfaces much
        // later as an unexplained failure. An empty array is a valid "no
        // matches" and costs nothing.
        case "search":
            return json([]);

        case "symbols": {
            const symbol = q.get("symbol") ?? "";
            const ticker = symbol;
            // Drafts show their ticker as-is; live mints get the truncated form.
            // Symbols carry the chain (`base:0x…`); the ticker shown should be
            // the address, not the routing prefix.
            const display = isDraftSymbol(symbol)
                ? symbol.slice(DRAFT_PREFIX.length)
                : parseSymbol(symbol).address;
            const name = display.length > 10 ? `${display.slice(0, 4)}…${display.slice(-4)}` : display;
            return json({
                name,
                ticker,
                description: name,
                type: "crypto",
                session: "24x7",
                exchange: "Pump",
                listed_exchange: "Pump",
                timezone: "Etc/UTC",
                minmov: 1,
                pricescale: 100000000, // 8 decimals — memecoin prices are tiny
                has_intraday: true,
                has_daily: true,
                has_weekly_and_monthly: false,
                supported_resolutions: SUPPORTED_RESOLUTIONS,
                volume_precision: 2,
                data_status: "streaming",
                currency_code: "USD",
            });
        }

        case "history": {
            const symbol = q.get("symbol") ?? "";
            const resolution = q.get("resolution") ?? "60";
            const from = Number(q.get("from"));
            const to = Number(q.get("to"));
            const countback = q.get("countback") ? Number(q.get("countback")) : undefined;
            if (!symbol || !Number.isFinite(from) || !Number.isFinite(to)) {
                return json({ s: "error", errmsg: "bad params" });
            }
            // Pre-launch draft: no pool/trades yet — empty series so the widget
            // shows "No data here" (pump.fun) rather than a synthetic flat line.
            if (isDraftSymbol(symbol)) {
                return json({ s: "no_data" });
            }
            const bars = await getUdfBars(symbol, resolution, from, to, countback);
            return json(bars);
        }

        default:
            return json({ s: "error", errmsg: `unknown endpoint: ${endpoint}` }, { status: 404 });
    }
}
