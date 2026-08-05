import { redis } from "@/lib/cache";

/**
 * Circuit breaker for a refused Helius key.
 *
 * When the quota runs out, load goes UP, not down. A refusal throws (on
 * purpose — a cached zero is worse than an error), so `withSwrCache` stores
 * nothing, so the NEXT request is a cold miss that calls upstream again. Every
 * client polling on its interval, times its retries, keeps hammering a key that
 * is already refusing — which is both how the quota gets spent to the last
 * credit and why it can't breathe long enough to recover.
 *
 * So the first refusal trips a flag, and while it's up, callers fail fast
 * without spending a request. Redis-backed, so one worker tripping it protects
 * every other worker too.
 *
 * Deliberately short: this is a breather, not a shutdown. Quotas get topped up
 * and rate limits pass, and the app must recover on its own without a deploy.
 */
const KEY = "helius:quota-out";
const COOLDOWN_SECONDS = 120;

/** Trip the breaker. Called wherever a quota refusal is detected. */
export async function markHeliusQuotaOut(): Promise<void> {
    try {
        await redis.set(KEY, Date.now(), { ex: COOLDOWN_SECONDS });
    } catch {
        // Redis down — we simply don't get the breaker this time.
    }
}

/**
 * Is the breaker up? Callers should skip the upstream request entirely and
 * serve whatever they already hold.
 *
 * Fails OPEN: if Redis can't answer, let the request through. A broken cache
 * must not look like a broken quota.
 */
export async function heliusQuotaOut(): Promise<boolean> {
    try {
        return (await redis.get(KEY)) !== null;
    } catch {
        return false;
    }
}
