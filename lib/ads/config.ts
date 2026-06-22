// Ad platform integration config (liteads decision service on Cloud Run).
//
// watchparty talks to the ad server ONLY through its own first-party
// `/api/ad/*` routes (see app/api/ad/). The browser never hits the ad origin
// directly — that keeps requests same-origin (no CORS), lets us inject geo from
// Cloudflare headers server-side, and hides the backend URL.

/** Server-side origin of the liteads FastAPI decision service (GCP Cloud Run). */
export const ADS_API_URL = (
    process.env.ADS_API_URL ?? "https://liteads-979878773946.us-west1.run.app"
).replace(/\/$/, "");

/** Client flag — ads run by default; set NEXT_PUBLIC_ADS_ENABLED="false" to disable. */
export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED !== "false";

// Slot IDs — keep these consistent across the app so the ad server's targeting
// and analytics stay clean (mirrors OpenAdServer's slot conventions).
export const AD_SLOTS = {
    feedCard: "feed_card",
    videoPreroll: "video_preroll",
    videoMidroll: "video_midroll",
    streamOverlay: "stream_overlay",
} as const;

export type AdSlotId = (typeof AD_SLOTS)[keyof typeof AD_SLOTS];

/** Inject a sponsored card after every Nth feed post. */
export const FEED_AD_INTERVAL = 8;
