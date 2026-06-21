// Ad platform integration config (OpenAdServer — ads.watchparty.xyz).
//
// watchparty talks to the ad server ONLY through its own first-party
// `/api/ad/*` routes (see app/api/ad/). The browser never hits the ad origin
// directly — that keeps requests same-origin (no CORS), lets us inject geo from
// Cloudflare headers server-side, and hides the backend URL.

/** Server-side origin of the OpenAdServer Next.js delivery API (ads.watchparty.xyz). */
export const ADS_API_URL = (process.env.ADS_API_URL ?? "https://ads.watchparty.xyz").replace(/\/$/, "");

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
