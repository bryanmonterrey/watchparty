import "server-only";
import { ADS_API_URL } from "./config";
import type { Ad, AdRequestParams } from "./types";

// Server-side ad delivery. Proxies directly to the liteads decision service
// (FastAPI on Cloud Run) which runs the ML retrieval/ranking/CTR pipeline.
// Called only from our own /api/ad/* route handlers, never the browser.
//
// Contract bridge: liteads exposes `POST /api/v1/ad/request` taking a richer
// payload (device is REQUIRED, interests live under `user_features`, num_ads)
// and returns `{ ads: [...] , count }`. We adapt to/from our internal single-Ad
// shape here so the rest of the app stays decoupled from the upstream schema.

/** Pull coarse geo from Cloudflare's edge headers (set by the CF network). */
export function geoFromHeaders(headers: Headers): { country?: string; city?: string } {
    const country = headers.get("cf-ipcountry") ?? undefined;
    const city = headers.get("cf-ipcity") ?? undefined;
    // CF uses "XX"/"T1" for unknown/Tor — treat those as no signal.
    const clean = country && country.length === 2 && country !== "XX" && country !== "T1" ? country : undefined;
    return { country: clean, city: city || undefined };
}

// liteads response shapes (subset we consume — see openadserver schemas/response.py).
interface LiteCreative {
    title?: string | null;
    description?: string | null;
    image_url?: string | null;
    video_url?: string | null;
    landing_url: string;
    creative_type?: string;
}
interface LiteAd {
    creative: LiteCreative;
    tracking: { impression_url: string; click_url: string; conversion_url?: string | null };
}
interface LiteAdListResponse {
    ads?: LiteAd[];
    count?: number;
}

/** Request a single ad from the liteads decision service. Returns null on no-fill or error. */
export async function fetchAd(params: AdRequestParams): Promise<Ad | null> {
    try {
        // liteads requires `device`; default web (field is a free-form string upstream).
        const device = params.device ?? { os: "web" };
        const res = await fetch(`${ADS_API_URL}/api/v1/ad/request`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                slot_id: params.slot_id,
                user_id: params.user_id,
                device,
                geo: params.geo,
                user_features: params.interests?.length ? { interests: params.interests } : undefined,
                num_ads: 1,
            }),
            signal: AbortSignal.timeout(3000),
            cache: "no-store",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as LiteAdListResponse;
        const top = data.ads?.[0];
        if (!top) return null;
        // Map liteads' creative onto our internal Ad shape (drop fields we don't use).
        return {
            creative: {
                title: top.creative.title ?? "",
                description: top.creative.description ?? undefined,
                image_url: top.creative.image_url ?? undefined,
                video_url: top.creative.video_url ?? undefined,
                landing_url: top.creative.landing_url,
            },
            tracking: {
                impression_url: top.tracking.impression_url,
                click_url: top.tracking.click_url,
            },
        };
    } catch {
        return null;
    }
}

/** Tracking URLs come back absolute (ads.watchparty.xyz). Re-point them at our
 *  own /api/ad/track proxy so the browser fires only same-origin pixels. */
export function rewriteTracking(ad: Ad, origin: string): Ad {
    const wrap = (url: string) => `${origin}/api/ad/track?u=${encodeURIComponent(url)}`;
    return {
        ...ad,
        tracking: {
            impression_url: wrap(ad.tracking.impression_url),
            click_url: wrap(ad.tracking.click_url),
        },
    };
}
