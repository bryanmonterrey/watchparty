import "server-only";

/**
 * Run a cached read, and turn an upstream FAILURE into an empty answer for this
 * caller only — never into a cached one.
 *
 * ## The bug this exists to prevent, which shipped twice
 *
 * `withCache` stores whatever its callback returns. So the natural-looking
 *
 *     withCache(key, ttl, () => fetchThing().catch(() => null))
 *
 * caches the failure. One refused request then serves `null` for the whole TTL
 * — 30 seconds for the trades table, **15 minutes** for the security and
 * activity cards on Mobula's free plan — and the card renders as "this coin has
 * nothing", which is indistinguishable from the truth.
 *
 * Observed on production 2026-08-12: `trade.coinTrades` for one Solana mint
 * returned 0 / 235 / 0 / 235 rows on 35-second spacing, while the same mint's
 * concentration query saw 632 trades. Nothing was logged, because the `.catch`
 * discarded the reason along with the error.
 *
 * The fix is to let the fetch THROW through `withCache` — a throwing callback
 * writes nothing to Redis, so the next request retries immediately — and to
 * convert it here, at the edge, where the fallback is a rendering decision
 * rather than a cached fact.
 *
 * ## What is NOT a failure
 *
 * A provider that answers "no trades", or one that is switched off, or a chain
 * it doesn't cover. Those are real answers and belong inside the cache: return
 * them normally from the callback and they are stored, which is the point.
 * Only a rejected promise reaches this.
 */
export async function upstreamEmpty<T>(
    label: string,
    fallback: T,
    read: () => Promise<T>,
): Promise<T> {
    try {
        return await read();
    } catch (err) {
        // WARN, not error: the surface degrades to empty and recovers by itself
        // on the next request. It still has to be visible — the whole failure
        // mode here is silence that looks like data.
        console.warn(`[${label}] upstream failed (not cached):`, err instanceof Error ? err.message : err);
        return fallback;
    }
}
