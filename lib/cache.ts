import { Redis } from "@upstash/redis";

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
    WALLET_ASSETS: 20,        // 20 s — busted by webhook on deposit/send; short TTL is the fallback
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
