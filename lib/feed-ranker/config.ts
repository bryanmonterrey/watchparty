// Phoenix feed-ranker integration config (x-algorithm retrieval+ranking on Cloud Run).
//
// watchparty talks to the ranker ONLY server-side, from the feed router /
// /api/feed/* routes — never the browser. Mirrors the liteads integration
// (lib/ads/config.ts): the heavy ML model (JAX two-tower + Grok-1-derived
// transformer, ~3 GB) runs as a FastAPI service on GCP Cloud Run; the edge
// sends candidates + user history and gets back a ranked order.

/** Server-side origin of the Phoenix ranking service (GCP Cloud Run). */
export const PHOENIX_API_URL = (
    process.env.PHOENIX_API_URL ?? ""
).replace(/\/$/, "");

/**
 * Ranker is OFF unless explicitly enabled AND a service URL is configured.
 * When off (or on any error), feed.getFeed falls back to reverse-chronological,
 * exactly like fetchAd returns null on no-fill.
 */
export const FEED_RANKER_ENABLED =
    process.env.FEED_RANKER_ENABLED === "true" && PHOENIX_API_URL.length > 0;

/** Hard timeout for a rank call — keep the feed responsive; fall back on slow. */
export const FEED_RANKER_TIMEOUT_MS = Number(process.env.FEED_RANKER_TIMEOUT_MS ?? 2500);

/** Shared secret sent as x-phoenix-secret; the service rejects calls without it. */
export const PHOENIX_SHARED_SECRET = process.env.PHOENIX_SHARED_SECRET ?? "";

/** Most-recent-N engagement events assembled into the user-history sequence. */
export const HISTORY_LENGTH = 127;

/**
 * Logit slots in the deployed checkpoint (`ranker/config.json` num_actions).
 * The model emits one probability per slot, so a signal logged at an index
 * >= this is SILENTLY DISCARDED — service.py guards with
 * `if 0 <= idx < num_actions`, writing nothing and raising nothing.
 *
 * That is not hypothetical: `ACTION.NEGATIVE` sat at 20 and every "not
 * interested" a user ever sent was dropped on the floor. tests/feed-actions
 * asserts the indices stay inside this bound.
 */
export const PHOENIX_NUM_ACTIONS = 19;

/**
 * Phoenix action indices, from the published `ActionName` proto enum.
 *
 * Lives here rather than in `signals.ts` (which is `server-only`, so a test
 * importing it dies on the server-only shim) for the same reason `meetsTier`
 * sits in `lib/premium/tiers.ts` — the invariant is worth asserting, and the
 * assertion has to be able to import the values. `signals.ts` re-exports it,
 * so existing `from "@/lib/feed-ranker/signals"` imports keep working.
 *
 * Every LOGGED index must be < PHOENIX_NUM_ACTIONS or the signal is discarded.
 */
export const ACTION = {
    FAVORITE: 1,
    REPLY: 4,
    QUOTE: 5,
    REPOST: 6,
    DWELL: 11,
    VIDEO_VIEW: 13,
    // CLIENT_TWEET_NOT_INTERESTED_IN. Was 20, outside the 19 logit slots, so
    // the service silently zeroed every one; history.ts remaps legacy rows.
    NEGATIVE: 17,
    // Reserved, not logged in v1. Parked past the proto enum (runs to 60+;
    // 21 is CLIENT_TWEET_FOLLOW_AUTHOR there) so it can never collide.
    TRADE: 100,
} as const;
