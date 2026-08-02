// GeckoTerminal-backed UDF (Universal Data Feed) helpers for the TradingView
// Charting Library. The library's bundled `Datafeeds.UDFCompatibleDatafeed`
// hits a REST server implementing /config, /symbols, /history (+ /time). These
// helpers implement the OHLCV side of that contract for ANY chain GeckoTerminal
// indexes — the symbol carries the network (see parseSymbol).
//
// We resolve a mint -> best GeckoTerminal pool (cached 1h), then pull OHLCV for
// the requested resolution + time window. Mirrors the logic in
// `server/routers/wallet.ts` getChartData, but range-based (from/to) as UDF
// requires, instead of a fixed timeframe enum.

import { withCache, withSwrCache, TTL } from "@/lib/cache";

const GT = "https://api.geckoterminal.com/api/v2/networks";
const GT_HEADERS = { Accept: "application/json;version=20230302" };

/** Default chain for a bare address — every link written before the chart went
 *  multi-chain carries one, and they must keep working. */
const DEFAULT_NETWORK = "solana";

/** How long a bar payload stays SERVEABLE past its fresh window. Long, on
 *  purpose: the alternative when upstream refuses us is a blank chart. */
const CHART_OHLCV_STALE = 60 * 60 * 6;

/** The window genuinely held no candles — distinct from "upstream refused",
 *  which must not be cached. Carries the library's page-back hint. */
class EmptyWindow extends Error {
    constructor(readonly nextTime?: number) {
        super("no candles in window");
    }
}

/**
 * Symbols are `network:address` — "base:0x…", "polygon_pos:0x…".
 *
 * The chart used to be Solana-only because this module hardcoded
 * /networks/solana; GeckoTerminal indexes every chain it tracks, so the network
 * just had to become part of the symbol. A bare address (no colon) is Solana,
 * which is what every existing link and stored layout contains.
 *
 * Split on the FIRST colon only: network slugs are colon-free but addresses
 * shouldn't be assumed to be.
 */
export function parseSymbol(symbol: string): { network: string; address: string } {
    const i = symbol.indexOf(":");
    if (i === -1) return { network: DEFAULT_NETWORK, address: symbol };
    return { network: symbol.slice(0, i) || DEFAULT_NETWORK, address: symbol.slice(i + 1) };
}

// TradingView resolution string -> GeckoTerminal [unit, aggregate, barSeconds].
// GeckoTerminal supports minute:{1,5,15}, hour:{1,4,12}, day:{1}.
const RESOLUTION_MAP: Record<string, [string, number, number]> = {
    "1": ["minute", 1, 60],
    "5": ["minute", 5, 300],
    "15": ["minute", 15, 900],
    "60": ["hour", 1, 3600],
    "240": ["hour", 4, 14400],
    "720": ["hour", 12, 43200],
    "1D": ["day", 1, 86400],
    D: ["day", 1, 86400],
};

export const SUPPORTED_RESOLUTIONS = ["1", "5", "15", "60", "240", "720", "1D"];

const WSOL = "So11111111111111111111111111111111111111112";

interface PoolInfo {
    address: string;
    tokenSide: "base" | "quote";
}

export async function resolvePool(mint: string, network = DEFAULT_NETWORK): Promise<PoolInfo | null> {
    try {
        return await withCache(`gt:pool:v2:${network}:${mint}`, TTL.CHART_POOL, async () => {
            const res = await fetch(
                `${GT}/${network}/tokens/${mint}/pools?sort=h24_volume_usd_liquidity_desc&limit=1`,
                { headers: GT_HEADERS, signal: AbortSignal.timeout(8000) },
            );
            if (!res.ok) throw new Error(`pools ${res.status}`);
            const json = await res.json();
            const pool = json.data?.[0];
            const address = pool?.attributes?.address as string | undefined;
            if (!address) throw new Error("no pool");
            const baseId: string = pool.relationships?.base_token?.data?.id ?? "";
            const tokenSide: "base" | "quote" = baseId.endsWith(`_${mint}`) ? "base" : "quote";
            return { address, tokenSide };
        });
    } catch {
        return null;
    }
}

export interface UdfBars {
    s: "ok" | "no_data" | "error";
    t?: number[];
    o?: number[];
    h?: number[];
    l?: number[];
    c?: number[];
    v?: number[];
    nextTime?: number;
    errmsg?: string;
}

/**
 * Fetch OHLCV bars for a mint within [from, to] (unix seconds) at a TradingView
 * resolution, returning the UDF /history response shape.
 */
export async function getUdfBars(
    rawSymbol: string,
    resolution: string,
    from: number,
    to: number,
    countBack?: number,
): Promise<UdfBars> {
    const cfg = RESOLUTION_MAP[resolution] ?? RESOLUTION_MAP["60"];
    const [unit, aggregate, barSeconds] = cfg;

    const { network, address } = parseSymbol(rawSymbol);
    // Native SOL isn't indexed by GeckoTerminal — remap to wSOL.
    const mint = address === "So11111111111111111111111111111111111111111" ? WSOL : address;

    const pool = await resolvePool(mint, network);
    if (!pool) return { s: "no_data" };

    // GeckoTerminal returns up to `limit` candles ending at before_timestamp.
    // Ask for enough to cover the window (capped at GT's 1000 max).
    const span = Math.max(countBack ?? 0, Math.ceil((to - from) / barSeconds) + 1);
    const limit = Math.min(1000, Math.max(1, span));

    // BUCKET the key. `to` is a live timestamp — the widget passes `now`, so a
    // raw key changed on every request and the cache never hit once: every
    // chart load went straight to GeckoTerminal, whose free tier is ~30
    // calls/min for the whole app with two crons already on it. The result was
    // a permanent `{"s":"error","errmsg":"ohlcv 429"}` and a chart stuck on its
    // loading screen.
    //
    // Rounding `to` down to the TTL means every viewer inside one window shares
    // a key, so a coin costs one upstream call per window no matter how many
    // people have it open. `limit` is rounded up to a coarse step for the same
    // reason — it's derived from from/to and would otherwise fragment the key
    // just as badly.
    const bucketedTo = Math.floor(to / TTL.CHART_OHLCV) * TTL.CHART_OHLCV;
    const bucketedLimit = Math.min(1000, Math.ceil(limit / 100) * 100);
    const key = `udf:v3:${network}:${mint}:${resolution}:${bucketedTo}:${bucketedLimit}`;
    try {
        // SWR, not plain cache. The Worker's egress is a shared Cloudflare
        // address and GeckoTerminal rate-limits by IP, so a cold key on prod
        // frequently CANNOT be filled — which is why charts went blank while
        // the same call succeeded from a laptop. Serving the last good bars,
        // even minutes old, beats an empty chart; only a true first-ever miss
        // blocks on upstream.
        return await withSwrCache(key, TTL.CHART_OHLCV, CHART_OHLCV_STALE, async () => {
            const url = new URL(`${GT}/${network}/pools/${pool.address}/ohlcv/${unit}`);
            url.searchParams.set("aggregate", String(aggregate));
            url.searchParams.set("limit", String(bucketedLimit));
            url.searchParams.set("currency", "usd");
            url.searchParams.set("token", pool.tokenSide);
            url.searchParams.set("before_timestamp", String(bucketedTo));

            const res = await fetch(url.toString(), {
                headers: GT_HEADERS,
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) throw new Error(`ohlcv ${res.status}`);
            const json = await res.json();
            const rows: number[][] = json.data?.attributes?.ohlcv_list ?? [];

            // rows: [time, open, high, low, close, volume]; GT returns newest-first.
            const sorted = rows
                .filter((r) => r[0] >= from && r[0] <= to)
                .sort((a, b) => a[0] - b[0]);

            if (sorted.length === 0) {
                // THROW rather than return. A cached "no_data" is indistinguishable
                // from a cached refusal, and caching it makes one bad response
                // blank the chart for the rest of the window. The catch below
                // turns it back into a no_data for the widget without writing it
                // to Redis.
                const oldest = rows.length ? Math.min(...rows.map((r) => r[0])) : undefined;
                throw new EmptyWindow(oldest && oldest < from ? oldest : undefined);
            }

            return {
                s: "ok",
                t: sorted.map((r) => r[0]),
                o: sorted.map((r) => r[1]),
                h: sorted.map((r) => r[2]),
                l: sorted.map((r) => r[3]),
                c: sorted.map((r) => r[4]),
                v: sorted.map((r) => r[5] ?? 0),
            } as UdfBars;
        });
    } catch (err) {
        // The widget treats `s: "error"` as a reason to sit on its loading
        // screen indefinitely, so an upstream blip read to the user as "broken
        // forever". no_data resolves the load and shows the library's own empty
        // state instead — but the REASON still travels, in errmsg, because
        // swallowing it is what made a rate-limited upstream look like a coin
        // with no trades.
        if (err instanceof EmptyWindow) {
            return err.nextTime ? { s: "no_data", nextTime: err.nextTime } : { s: "no_data" };
        }
        const reason = err instanceof Error ? err.message : "fetch failed";
        console.error("[udf] ohlcv failed:", reason);
        return { s: "no_data", errmsg: reason };
    }
}
