import { Redis } from "@upstash/redis";
import { after } from "next/server";

const upstash = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
    // One attempt. The client's default retries a failed fetch five times
    // with backoff, which under the breaker below only multiplies the wait.
    retry: { retries: 0 },
});

// ─── Circuit breaker ────────────────────────────────────────────────────────
//
// Every caller of this client already treats a failure as a cache miss
// (withCache / withSwrCache fall through; the better-auth secondaryStorage
// wrapper in lib/auth/server.ts fails OPEN). What none of them could do was
// fail FAST. On 2026-10-03 Upstash had the free database "temporarily
// rate-limited" (daily quota): every command still made the round trip and
// came back 200–700 ms later carrying an error. With the session read, the
// auth rate-limit increment and a cache read on most requests, that put
// 1.5–3.5 s in front of EVERY dynamic request — a zod 400 took 2 s, the feed
// 5–6 s — and the feed's own fetch started timing out at the edge, so the
// page kept painting its stale snapshot (hearts "un-liking" themselves).
//
// So: a failure opens the breaker and every command until it closes throws
// immediately, no network. The window doubles with each consecutive failure
// (10 s → 20 s → 40 s → 60 s cap) and one command is let through at the end
// to probe; success closes it and resets the count. A rate-limit answer the
// client names as such opens at the cap at once — but it usually doesn't:
// @upstash/redis chokes on the `{"error": …}` body with "res.map is not a
// function", which is why the escalation, not the message, is the mechanism.
const FAILURE_OPEN_MS = 10_000;
const MAX_OPEN_MS = 60_000;
let breakerOpenUntil = 0;
let breakerReason = "";
let consecutiveFailures = 0;

const isRateLimited = (err: unknown) => /rate.?limit/i.test(err instanceof Error ? err.message : String(err));

export class RedisBreakerOpenError extends Error {
    constructor() {
        super(`redis skipped: breaker open (${breakerReason})`);
        this.name = "RedisBreakerOpenError";
    }
}

/** For tests and diagnostics: is the breaker currently refusing commands? */
export function redisBreakerOpen() {
    return Date.now() < breakerOpenUntil;
}

// Only the command methods are wrapped; property reads (pipeline builders,
// config) pass through. Everything awaits, so a rejected promise is what
// callers already handle.
const redis: Redis = new Proxy(upstash, {
    get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") return value;
        // pipeline()/multi() return a builder synchronously; gating them would
        // hand callers a rejected promise where they expect an object. Their
        // exec() goes to the network ungated — three call sites, all wrapped.
        if (prop === "pipeline" || prop === "multi") return (value as (...a: unknown[]) => unknown).bind(target);
        return (...args: unknown[]) => {
            if (Date.now() < breakerOpenUntil) return Promise.reject(new RedisBreakerOpenError());
            let out: unknown;
            try {
                out = (value as (...a: unknown[]) => unknown).apply(target, args);
            } catch (err) {
                trip(err);
                throw err;
            }
            if (out instanceof Promise) {
                return out.then(
                    (v) => { breakerOpenUntil = 0; consecutiveFailures = 0; return v; },
                    (err) => { trip(err); throw err; },
                );
            }
            return out;
        };
    },
}) as Redis;

function trip(err: unknown) {
    consecutiveFailures++;
    const limited = isRateLimited(err);
    breakerReason = limited ? "upstash rate-limited" : (err instanceof Error ? err.message : String(err)).slice(0, 80);
    const openMs = limited ? MAX_OPEN_MS : Math.min(MAX_OPEN_MS, FAILURE_OPEN_MS * 2 ** (consecutiveFailures - 1));
    breakerOpenUntil = Date.now() + openMs;
}

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
    // HOLDINGS = balances + metadata, no prices (prices are layered on per
    // request from the shared per-mint caches below). What's in here changes
    // only when a transaction touches the wallet, and the Helius address
    // webhook busts this key the moment one does — so the window is long on
    // purpose. It used to be 30 s because prices rode along inside it, which
    // meant every open tab pulled a fresh DAS fetch twice a minute to keep a
    // number current that wasn't even per-wallet.
    WALLET_HOLDINGS: 600,        // 10 min fresh — webhook-busted on any tx
    WALLET_HOLDINGS_STALE: 3600, // 1 h stale-serveable — survives an outage
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
    RPC_ACCOUNT: 10,         // 10 s — account/balance reads
    RPC_TOKEN_ACCOUNTS: 15,  // 15 s — token accounts by owner/delegate
    RPC_GPA: 30,             // 30 s — program account scans (expensive upstream)
    RPC_ASSET: 30,           // 30 s — Helius DAS asset reads
    RPC_TX: 300,             // 5 min — confirmed transactions are immutable
} as const;
