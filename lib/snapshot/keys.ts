/**
 * Snapshot keys for viewer-dependent data.
 *
 * Most of what's worth snapshotting is computed *for the viewer*. A feed row
 * carries `isLiked`/`isBookmarked`/`isReposted` straight from
 * `server/lib/post-shape.ts`, where they're `EXISTS` subqueries against
 * `viewerId`. Notifications and bookmarks are the viewer's by definition.
 *
 * So a snapshot is only ever valid for the account that wrote it, and this app
 * has **multi-session**: `setActiveDeviceSession` switches accounts with no
 * sign-out in between (`lib/auth/client.ts`). Key by session and that switch
 * simply misses the cache. Key by surface alone and the new account gets the
 * previous one's hearts painted onto their feed — briefly, then corrected,
 * which is precisely the flicker that looks like a bug you can't reproduce.
 *
 * Keying is the *correctness* half. The privacy half is `clearAllSnapshots()`
 * on sign-out, since keying alone leaves the old account's content in
 * localStorage after they leave.
 */

/** Separator that cannot appear in an id, so `a:b` and `ab` never collide. */
const SEP = ":";

/**
 * Key for a surface that also renders signed-out, where the anonymous view is
 * a real, cacheable thing — the feed and the coin rails under `PUBLIC_BROWSING`.
 * Signed-out data gets its own `anon` bucket rather than being refused, and it
 * can never be confused with a real account's.
 */
export function viewerKey(viewerId: string | null | undefined, ...parts: string[]): string {
    return [viewerId || "anon", ...parts].join(SEP);
}

/**
 * Key for a surface that only exists for a signed-in viewer — bookmarks,
 * notifications. Returns `""` when there is no viewer, and every store treats
 * an empty key as "do nothing", so a signed-out render can neither read nor
 * write. Without this, a logged-out visit would write an `anon` snapshot of an
 * empty protected list and then paint that empty state to the next person who
 * signs in.
 */
export function privateViewerKey(viewerId: string | null | undefined, ...parts: string[]): string {
    if (!viewerId) return "";
    return [viewerId, ...parts].join(SEP);
}

/**
 * A stable string for a query's input object, for surfaces keyed by their
 * filters (the coin rail, the trending board).
 *
 * Plain `JSON.stringify` emits properties in insertion order, so the same
 * logical input can serialize two ways — `{sort, limit}` and `{limit, sort}`
 * are one query but two snapshot keys. TanStack's own `hashKey` sorts keys for
 * exactly this reason, and a snapshot key that disagrees with the query key it
 * mirrors fails in the quietest possible way: never a wrong paint, just a
 * permanent cache miss that looks like the feature was never wired up.
 *
 * `undefined` members are dropped, which matches both `JSON.stringify` and
 * tRPC — an absent input and an explicitly-undefined one are the same request.
 */
export function queryInputKey(input: unknown): string {
    return JSON.stringify(input, (_k, v) =>
        v && typeof v === "object" && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
            : v,
    ) ?? "";
}
