/**
 * Resolution arithmetic for candles — pure, and importable from ANYWHERE.
 *
 * Deliberately free of `server-only` and of any database import. The live-bar
 * subscription (lib/coins/candle-stream) is a client module and needs exactly
 * this maths to bucket an incoming bar the same way the SQL read path does; when
 * these lived in lib/coins/candles alongside the Drizzle queries, importing them
 * pulled `server-only` into the browser bundle and the build refused it.
 *
 * Rule: anything in here must stay computable in a browser. Queries belong in
 * lib/coins/candles.
 */

/** The only resolutions written to `coin_candles`. Everything TradingView asks
 *  for is either one of these or an exact multiple of one. */
export const STORED_RESOLUTIONS = ["1", "60", "1D"] as const;
export type StoredResolution = (typeof STORED_RESOLUTIONS)[number];

export type Candle = { ts: number; o: number; h: number; l: number; c: number; v: number | null };

/** Bar length in seconds, per TradingView resolution string. */
const BAR_SECONDS: Record<string, number> = {
    "1": 60,
    "5": 300,
    "15": 900,
    "60": 3600,
    "240": 14400,
    "720": 43200,
    "1D": 86400,
    D: 86400,
};

export const barSeconds = (resolution: string) => BAR_SECONDS[resolution] ?? 3600;

/**
 * Which stored tier a requested resolution rolls up FROM.
 *
 * 5m and 15m are whole multiples of 1m; 4h and 12h are whole multiples of 1h.
 * Aggregating is exact, so storing those four separately would multiply write
 * cost for a series we can already derive.
 */
export function sourceResolution(resolution: string): StoredResolution {
    switch (resolution) {
        case "1":
        case "5":
        case "15":
            return "1";
        case "1D":
        case "D":
            return "1D";
        default:
            return "60";
    }
}
