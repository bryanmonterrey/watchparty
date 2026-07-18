import { type NextRequest, NextResponse } from "next/server";
import { withSwrCache } from "@/lib/cache";

// Caching proxy for Pyth's TradingView UDF shim (benchmarks.pyth.network).
// The perps surfaces used to hit Pyth directly from every browser, so a single
// user's pollers (chart + tape + oracle + TV datafeed, or two tabs) tripped
// Pyth's per-IP rate limit and every chart 429'd at once. Routing through here
// means ALL users share one Redis-cached copy per (endpoint, query) and
// upstream sees a trickle regardless of client poll rates; on upstream failure
// the SWR cache keeps serving the last good bars. /time never leaves the box —
// it's just the unix clock.

const UPSTREAM = "https://benchmarks.pyth.network/v1/shims/tradingview";

/** fresh/stale-serveable seconds per endpoint (see withSwrCache). */
const TTLS: Record<string, [fresh: number, stale: number]> = {
    config: [3600, 86400],
    symbols: [3600, 86400],
    search: [300, 3600],
    history: [30, 600],
};

/** history from/to land on this grid so consecutive polls share a cache key. */
const HISTORY_BUCKET = 30;

const json = (data: unknown, init?: ResponseInit) =>
    NextResponse.json(data, { headers: { "Cache-Control": "no-store" }, ...init });

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ path?: string[] }> },
) {
    const { path } = await params;
    const endpoint = path?.[0] ?? "";

    if (endpoint === "time") {
        return new NextResponse(String(Math.floor(Date.now() / 1000)), {
            headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
        });
    }

    const ttl = TTLS[endpoint];
    if (!ttl) return json({ s: "error", errmsg: `unknown endpoint: ${endpoint}` }, { status: 404 });

    const search = new URLSearchParams(req.nextUrl.searchParams);
    if (endpoint === "history") {
        const from = Number(search.get("from"));
        const to = Number(search.get("to"));
        if (!search.get("symbol") || !Number.isFinite(from) || !Number.isFinite(to)) {
            return json({ s: "error", errmsg: "bad params" });
        }
        search.set("from", String(Math.floor(from / HISTORY_BUCKET) * HISTORY_BUCKET));
        search.set("to", String(Math.floor(to / HISTORY_BUCKET) * HISTORY_BUCKET));
    }
    search.sort();

    try {
        const data = await withSwrCache(
            `pyth-udf:v1:${endpoint}?${search.toString()}`,
            ttl[0],
            ttl[1],
            async () => {
                const res = await fetch(`${UPSTREAM}/${endpoint}?${search.toString()}`);
                if (!res.ok) throw new Error(`pyth ${res.status}`);
                return (await res.json()) as unknown;
            },
        );
        return json(data);
    } catch {
        return json({ s: "error", errmsg: "upstream unavailable" }, { status: 502 });
    }
}
