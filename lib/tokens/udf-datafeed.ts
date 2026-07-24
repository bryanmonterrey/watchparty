// GeckoTerminal-backed UDF (Universal Data Feed) helpers for the TradingView
// Charting Library. The library's bundled `Datafeeds.UDFCompatibleDatafeed`
// hits a REST server implementing /config, /symbols, /history (+ /time). These
// helpers implement the OHLCV side of that contract for a Solana mint.
//
// We resolve a mint -> best GeckoTerminal pool (cached 1h), then pull OHLCV for
// the requested resolution + time window. Mirrors the logic in
// `server/routers/wallet.ts` getChartData, but range-based (from/to) as UDF
// requires, instead of a fixed timeframe enum.

import { withCache, TTL } from "@/lib/cache";

const GT = "https://api.geckoterminal.com/api/v2/networks/solana";
const GT_HEADERS = { Accept: "application/json;version=20230302" };

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

// The Meteora bonding curve's first checkpoint price (SOL per token), taken
// from hooks/use-token-launch.ts `customPrices[0]`. × 1e9 total supply ≈ 1 SOL
// initial market cap — this is the "starting price" a pre-launch draft's flat
// baseline chart sits at (pump.fun-style flat line until the first trade).
export const CURVE_START_PRICE_SOL = 1e-9;

interface PoolInfo {
    address: string;
    tokenSide: "base" | "quote";
}

export async function resolvePool(mint: string): Promise<PoolInfo | null> {
    try {
        return await withCache(`gt:pool:${mint}`, TTL.CHART_POOL, async () => {
            const res = await fetch(
                `${GT}/tokens/${mint}/pools?sort=h24_volume_usd_liquidity_desc&limit=1`,
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
    rawMint: string,
    resolution: string,
    from: number,
    to: number,
    countBack?: number,
): Promise<UdfBars> {
    const cfg = RESOLUTION_MAP[resolution] ?? RESOLUTION_MAP["60"];
    const [unit, aggregate, barSeconds] = cfg;

    // Native SOL isn't indexed by GeckoTerminal — remap to wSOL.
    const mint = rawMint === "So11111111111111111111111111111111111111111" ? WSOL : rawMint;

    const pool = await resolvePool(mint);
    if (!pool) return { s: "no_data" };

    // GeckoTerminal returns up to `limit` candles ending at before_timestamp.
    // Ask for enough to cover the window (capped at GT's 1000 max).
    const span = Math.max(countBack ?? 0, Math.ceil((to - from) / barSeconds) + 1);
    const limit = Math.min(1000, Math.max(1, span));

    const key = `udf:${mint}:${resolution}:${to}:${limit}`;
    try {
        return await withCache(key, TTL.CHART_OHLCV, async () => {
            const url = new URL(`${GT}/pools/${pool.address}/ohlcv/${unit}`);
            url.searchParams.set("aggregate", String(aggregate));
            url.searchParams.set("limit", String(limit));
            url.searchParams.set("currency", "usd");
            url.searchParams.set("token", pool.tokenSide);
            url.searchParams.set("before_timestamp", String(to));

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
                // Signal there may be older data before `from` so the library can page back.
                const oldest = rows.length ? Math.min(...rows.map((r) => r[0])) : undefined;
                return oldest && oldest < from ? { s: "no_data", nextTime: oldest } : { s: "no_data" };
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
        return { s: "error", errmsg: err instanceof Error ? err.message : "fetch failed" };
    }
}

/** Live SOL price in USD (GeckoTerminal, cached ~90s). Falls back to a sane
 *  constant if GT is unreachable so a draft baseline never renders NaN. */
export async function getSolUsd(): Promise<number> {
    try {
        return await withCache("gt:solusd", TTL.SOL_PRICE, async () => {
            const res = await fetch(`${GT}/tokens/${WSOL}`, {
                headers: GT_HEADERS,
                signal: AbortSignal.timeout(6000),
            });
            if (!res.ok) throw new Error(`solusd ${res.status}`);
            const j = await res.json();
            const p = Number(j.data?.attributes?.price_usd);
            if (!Number.isFinite(p) || p <= 0) throw new Error("bad price");
            return p;
        });
    } catch {
        return 200;
    }
}

/**
 * Flat baseline bars for a pre-launch draft token — a single price held
 * constant (open=high=low=close, volume 0), the pump.fun "flat line until the
 * first trade" look. `priceUsd` is the bonding curve's starting price. The
 * series is anchored to the last few days up to now (not all of history), so
 * scrolling back stops cleanly instead of streaming an infinite flat line.
 */
export function getFlatBaselineBars(
    resolution: string,
    from: number,
    to: number,
    priceUsd: number,
    countBack?: number,
): UdfBars {
    const barSeconds = (RESOLUTION_MAP[resolution] ?? RESOLUTION_MAP["60"])[2];
    const now = Math.floor(Date.now() / 1000);
    const LOOKBACK = 3 * 86400; // 3 days of flat bars behind "now"
    const windowStart = now - LOOKBACK;

    const end = Math.min(to, now);
    const start = Math.max(from, windowStart);
    // Requested range is entirely outside the flat window → no (more) data.
    if (end <= windowStart || start > end) return { s: "no_data" };

    const lastBar = Math.floor(end / barSeconds) * barSeconds;
    const firstBar = Math.ceil(start / barSeconds) * barSeconds;
    let t: number[] = [];
    for (let bt = firstBar; bt <= lastBar; bt += barSeconds) if (bt > 0) t.push(bt);
    if (countBack && countBack > 0 && t.length > countBack) t = t.slice(t.length - countBack);
    if (t.length === 0) return { s: "no_data" };

    const flat = t.map(() => priceUsd);
    return { s: "ok", t, o: flat, h: [...flat], l: [...flat], c: [...flat], v: t.map(() => 0) };
}
