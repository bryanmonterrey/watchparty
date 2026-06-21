import { type NextRequest, NextResponse } from "next/server";
import { fetchAd, geoFromHeaders, rewriteTracking } from "@/lib/ads/server";
import type { AdRequestParams } from "@/lib/ads/types";

// First-party display-ad endpoint. The client posts a slot_id (+ optional
// user_id/interests); we add Cloudflare geo, proxy to the ad server, and return
// a single creative with tracking URLs re-pointed at our own /api/ad/track.
export async function POST(req: NextRequest) {
    let body: Partial<AdRequestParams>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ad: null }, { status: 400 });
    }

    const ad = await fetchAd({
        slot_id: body.slot_id ?? "default",
        user_id: body.user_id,
        device: body.device,
        geo: body.geo ?? geoFromHeaders(req.headers),
        interests: body.interests,
    });

    if (!ad) return NextResponse.json({ ad: null }, { status: 200 });

    const origin = req.nextUrl.origin;
    return NextResponse.json(
        { ad: rewriteTracking(ad, origin) },
        { headers: { "Cache-Control": "no-store" } },
    );
}
