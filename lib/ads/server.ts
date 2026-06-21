import "server-only";
import { ADS_API_URL } from "./config";
import type { Ad, AdRequestParams } from "./types";

// Server-side ad delivery. Proxies to the OpenAdServer Next.js delivery API
// (ads.watchparty.xyz) which itself runs the ML ranking + Amazon APS fallback.
// Called only from our own /api/ad/* route handlers, never the browser.

/** Pull coarse geo from Cloudflare's edge headers (set by the CF network). */
export function geoFromHeaders(headers: Headers): { country?: string; city?: string } {
    const country = headers.get("cf-ipcountry") ?? undefined;
    const city = headers.get("cf-ipcity") ?? undefined;
    // CF uses "XX"/"T1" for unknown/Tor — treat those as no signal.
    const clean = country && country.length === 2 && country !== "XX" && country !== "T1" ? country : undefined;
    return { country: clean, city: city || undefined };
}

/** Request a single ad from the upstream delivery API. Returns null on no-fill or error. */
export async function fetchAd(params: AdRequestParams): Promise<Ad | null> {
    try {
        const res = await fetch(`${ADS_API_URL}/api/ad/request`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
            // The upstream returns 204 (no body) when nothing fills the slot.
            signal: AbortSignal.timeout(3000),
            cache: "no-store",
        });
        if (res.status === 204 || !res.ok) return null;
        const data = (await res.json()) as { ad: Ad | null };
        return data.ad ?? null;
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
