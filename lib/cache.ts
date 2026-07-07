import { Redis } from "@upstash/redis";
import { after } from "next/server";

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

/**
 * Cache-aside helper. Tries Redis first, falls back to fn() on miss.
 * Silently bypasses cache if Redis is unavailable.
 */
export async function withCache<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>
): Promise<T> {
    try {
        const cached = await redis.get<T>(key);
        if (cached !== null && cached !== undefined) return cached;
    } catch {
        // Redis unavailable — fall through
    }

    const result = await fn();

    try {
        await redis.set(key, result, { ex: ttlSeconds });
    } catch {
        // Redis unavailable — ignore
    }

    return result;
}

type SwrEnvelope<T> = { v: T; __t: number };

/**
 * Stale-while-revalidate cache-aside. Within `freshSeconds` the cached value
 * is served as-is; between fresh and `staleSeconds` the STALE value is served
 * immediately and a background refresh (next/server `after`, i.e. waitUntil
 * on Workers) repopulates the cache — the request never waits on upstream.
 * Only a full miss (or age > staleSeconds, Redis expiry) blocks on fn().
 *
 * Use for expensive upstream aggregations (Helius, DexScreener) where serving
 * a value a few minutes old beats making the user watch a spinner. Writes that
 * change the underlying data should still invalidateCache() the key.
 */
export async function withSwrCache<T>(
    key: string,
    freshSeconds: number,
    staleSeconds: number,
    fn: () => Promise<T>
): Promise<T> {
    try {
        const cached = await redis.get<SwrEnvelope<T> | T>(key);
        if (cached !== null && cached !== undefined) {
            // Envelope written by us — serve it, refreshing in the background
            // when past the fresh window.
            if (typeof cached === "object" && cached !== null && "__t" in (cached as object)) {
                const { v, __t } = cached as SwrEnvelope<T>;
                const ageSec = (Date.now() - __t) / 1000;
                if (ageSec > freshSeconds) {
                    after(async () => {
                        try {
                            // NX lock so concurrent stale hits refresh once.
                            const locked = await redis.set(`lock:${key}`, 1, { nx: true, ex: 30 });
                            if (locked !== "OK") return;
                            const result = await fn();
                            await redis.set(key, { v: result, __t: Date.now() }, { ex: staleSeconds });
                        } catch {
                            // background refresh is best-effort
                        }
                    });
                }
                return v;
            }
            // Legacy unwrapped value (pre-SWR writer) — serve it; it expires
            // on its own short TTL and the next miss writes the envelope.
            return cached as T;
        }
    } catch {
        // Redis unavailable — fall through
    }

    const result = await fn();

    try {
        await redis.set(key, { v: result, __t: Date.now() }, { ex: staleSeconds });
    } catch {
        // Redis unavailable — ignore
    }

    return result;
}

/**
 * Invalidate a cache key (e.g. after a mutation).
 */
export async function invalidateCache(key: string): Promise<void> {
    try {
        await redis.del(key);
    } catch {
        // ignore
    }
}

export { redis };

// TTL constants (seconds)
export const TTL = {
    SOL_PRICE: 90,           // 1.5 min — volatile
    TOKEN_PRICE: 120,        // 2 min — per mint price
    TOKEN_SEARCH: 300,       // 5 min — search results
    WALLET_ASSETS: 30,        // 30 s fresh window (SWR; see WALLET_ASSETS_STALE)
    WALLET_ASSETS_STALE: 600, // 10 min stale-serveable window — served instantly + refreshed in background
    TRANSACTIONS: 20,        // 20 s — show new txs quickly
    NFTS: 900,               // 15 min — NFT list
    TOKEN_METADATA: 86400,   // 24h — on-chain metadata
    TOKEN_INFO: 86400,       // 24h — description/links
    COINGECKO: 172800,       // 48h — market metadata
    CHART_POOL: 3600,        // 1h — GT pool address
    CHART_OHLCV: 300,        // 5 min — OHLCV candles
    SEARCH: 120,             // 2 min — content search
    COLLABORATORS: 60,       // 1 min — user search
    USER_PROFILE: 300,       // 5 min — user profile (customSession + search)
    USER_SEARCH: 60,         // 1 min — user search results
    CONTENT_FEED: 120,       // 2 min — posts feed
} as const;
