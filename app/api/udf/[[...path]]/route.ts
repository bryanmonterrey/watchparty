import { type NextRequest, NextResponse } from "next/server";
import {
    getUdfBars,
    getFlatBaselineBars,
    getSolUsd,
    CURVE_START_PRICE_SOL,
    SUPPORTED_RESOLUTIONS,
} from "@/lib/tokens/udf-datafeed";

// UDF (Universal Data Feed) REST server for the TradingView Charting Library.
// `Datafeeds.UDFCompatibleDatafeed("/api/udf")` calls:
//   GET /api/udf/config   GET /api/udf/symbols?symbol=<mint>
//   GET /api/udf/history?symbol=<mint>&resolution=&from=&to=&countback=
//   GET /api/udf/time
// For a LIVE token the symbol is the Solana mint (OHLCV from GeckoTerminal).
// For a PRE-LAUNCH draft the symbol is `draft-<ticker>` — there's no pool yet,
// so we serve a flat baseline at the bonding curve's starting price.

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
                supports_search: false,
                supports_timescale_marks: false,
                supports_time: true,
            });

        case "time":
            return new NextResponse(String(Math.floor(Date.now() / 1000)), {
                headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
            });

        case "symbols": {
            const symbol = q.get("symbol") ?? "";
            const ticker = symbol;
            // Drafts show their ticker as-is; live mints get the truncated form.
            const display = isDraftSymbol(symbol) ? symbol.slice(DRAFT_PREFIX.length) : symbol;
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
            // Pre-launch draft: no pool exists yet — hold a flat line at the
            // bonding curve's starting price (converted to USD via live SOL).
            if (isDraftSymbol(symbol)) {
                const solUsd = await getSolUsd();
                const bars = getFlatBaselineBars(resolution, from, to, CURVE_START_PRICE_SOL * solUsd, countback);
                return json(bars);
            }
            const bars = await getUdfBars(symbol, resolution, from, to, countback);
            return json(bars);
        }

        default:
            return json({ s: "error", errmsg: `unknown endpoint: ${endpoint}` }, { status: 404 });
    }
}
