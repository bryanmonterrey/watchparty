
/**
 * Negative cache for top-level slugs that turned out not to be usernames.
 *
 * ## Why this exists
 *
 * `/pipeline` — not a route — matches `app/(app)/[username]`, which correctly
 * calls `notFound()`. But the response has already begun streaming by then, so
 * Next cannot change the status: the docs call this a **soft 404** (right page,
 * `noindex`, status **200**). See `docs/buzz-adoption-plan.md`.
 *
 * Search engines honour the `noindex`. Scanners read the status line, see
 * `200 OK`, and conclude they found something. One of them sent **1,183,094
 * requests in nine hours** — 2,191/min — and every single one cost a DB lookup,
 * a full SSR render and 93 KB, uncacheable (`no-store`). That saturated the
 * container's 4,096-connection ceiling and took the site down.
 *
 * ## Why a NEGATIVE cache and not an allowlist
 *
 * Middleware runs before the response streams, so it *can* set a real status —
 * but it cannot know which usernames exist. 404-ing on absence from a list of
 * known usernames means any staleness **404s a real profile**. Unacceptable.
 *
 * Inverting it makes staleness harmless: the page records a slug only once it
 * has *proven* it doesn't resolve, so a real username can never be recorded.
 * A stale or unavailable cache can only ever **fail open** — the request falls
 * through and renders exactly as it does today.
 *
 * It also matches the shape of the abuse. The traffic is a million requests to
 * *one* path, so the first pays full price and every one after is a cheap 404.
 *
 * ## Two tiers on purpose
 *
 * The in-isolate `Set` answers the repeat case with no network at all. Workers
 * isolates are short-lived, so its hit rate would be poor for diverse traffic —
 * but this traffic is the opposite of diverse, which is exactly when a tiny
 * local cache pays. Redis is the shared tier behind it.
 */

// The SHARED client, for its circuit breaker. This had its own
// `new Redis(...)`, and the middleware runs it on every single-segment path —
// so while Upstash was rate-limited (2026-10-03) every such request, /robots.txt
// included, waited 0.5–0.7 s for Redis to say no before Next even started.
import { redis } from "@/lib/cache";

const KEY_PREFIX = "slugmiss:v1:";
/**
 * One hour, and the short side of the trade is deliberate.
 *
 * A scanner re-triggers the record on its next miss, so the TTL barely affects
 * it. What the TTL really bounds is the one bad case: somebody probes
 * `/coolhandle`, it 404s and gets cached, and then a real user CLAIMS
 * `coolhandle` — their profile 404s until the entry expires.
 *
 * ⚠️ `clearSlugMiss()` exists to close that window properly and is NOT wired
 * up: usernames are written through better-auth's adapter, not a tRPC mutation,
 * so there is no single call site to hook. Wire it at the claim path when that
 * moves, and this TTL can go back up.
 */
const TTL_SECONDS = 60 * 60;

/** Per-isolate memo. Bounded — a scanner could otherwise enumerate into it. */
const localMisses = new Set<string>();
const LOCAL_MAX = 500;

function keyFor(slug: string) {
    return KEY_PREFIX + slug.toLowerCase();
}

/**
 * Record that `slug` resolved to nothing. Call ONLY after the lookup has
 * actually failed — never speculatively, or the guarantee above is void.
 */
export async function recordSlugMiss(slug: string): Promise<void> {
    if (!slug) return;
    if (localMisses.size >= LOCAL_MAX) localMisses.clear();
    localMisses.add(slug.toLowerCase());
    try {
        await redis.set(keyFor(slug), 1, { ex: TTL_SECONDS });
    } catch {
        // Redis down: the local tier still helps this isolate, and the request
        // path is unaffected. Never throw into a render.
    }
}

/**
 * Has this slug already been proven missing? Fails open — any error is a
 * `false`, so the page renders exactly as it would without this cache.
 */
export async function isKnownSlugMiss(slug: string): Promise<boolean> {
    if (!slug) return false;
    if (localMisses.has(slug.toLowerCase())) return true;
    try {
        const hit = await redis.get(keyFor(slug));
        if (hit !== null && hit !== undefined) {
            if (localMisses.size >= LOCAL_MAX) localMisses.clear();
            localMisses.add(slug.toLowerCase());
            return true;
        }
    } catch {
        // Fail open.
    }
    return false;
}

/**
 * Clear a slug — call when a username is claimed or changed, so a handle that
 * 404'd before it existed starts resolving immediately instead of waiting out
 * the TTL.
 */
export async function clearSlugMiss(slug: string): Promise<void> {
    if (!slug) return;
    localMisses.delete(slug.toLowerCase());
    try {
        await redis.del(keyFor(slug));
    } catch {
        // Fail open: the TTL still expires it.
    }
}

/** Test seam. */
export function __resetLocalSlugMisses() {
    localMisses.clear();
}
