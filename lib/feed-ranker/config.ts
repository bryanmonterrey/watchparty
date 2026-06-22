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

/** Most-recent-N engagement events assembled into the user-history sequence. */
export const HISTORY_LENGTH = 127;
