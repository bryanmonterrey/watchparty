import { Redis } from "@upstash/redis";

// Upstash Redis is HTTP-based, so it works on both Node and Cloudflare Workers.
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
  fn: () => Promise<T>,
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
  SOL_PRICE: 90,
  TOKEN_PRICE: 120,
  TOKEN_SEARCH: 300,
  WALLET_ASSETS: 20,
  TRANSACTIONS: 20,
  NFTS: 900,
  TOKEN_METADATA: 86400,
  TOKEN_INFO: 86400,
  COINGECKO: 172800,
  CHART_POOL: 3600,
  CHART_OHLCV: 300,
  SEARCH: 120,
  COLLABORATORS: 60,
  USER_PROFILE: 300,
  USER_SEARCH: 60,
  CONTENT_FEED: 120,
} as const;
