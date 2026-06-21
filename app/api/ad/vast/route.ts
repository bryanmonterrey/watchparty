import { type NextRequest, NextResponse } from "next/server";
import { fetchAd, geoFromHeaders } from "@/lib/ads/server";
import { buildVmap, type AdBreak } from "@/lib/ads/vast";
import { AD_SLOTS } from "@/lib/ads/config";

// Video-ad endpoint for the IMA player. Requests preroll (+ midroll) creatives
// from the ad server and returns a VMAP the player loads via `adTagUrl`.
// Always returns valid XML (empty VMAP on no-fill) so IMA degrades cleanly.
export async function GET(req: NextRequest) {
    const uid = req.nextUrl.searchParams.get("uid") ?? undefined;
    const geo = geoFromHeaders(req.headers);

    const [preroll, midroll] = await Promise.all([
        fetchAd({ slot_id: AD_SLOTS.videoPreroll, user_id: uid, geo }),
        fetchAd({ slot_id: AD_SLOTS.videoMidroll, user_id: uid, geo }),
    ]);

    const breaks: AdBreak[] = [];
    if (preroll) breaks.push({ offset: "start", id: "preroll", ad: preroll });
    if (midroll) breaks.push({ offset: "50%", id: "midroll", ad: midroll });

    return new NextResponse(buildVmap(breaks), {
        status: 200,
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}
