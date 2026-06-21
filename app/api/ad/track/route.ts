import { type NextRequest, NextResponse } from "next/server";
import { ADS_API_URL } from "@/lib/ads/config";

// 1x1 transparent GIF — returned so this endpoint works as an <img> pixel too.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// First-party tracking proxy. Fires impression/click pixels server-side so the
// ad backend origin never leaks to the browser. Only forwards to our ad server.
export async function GET(req: NextRequest) {
    const target = req.nextUrl.searchParams.get("u");

    if (target && target.startsWith(ADS_API_URL)) {
        try {
            await fetch(target, { signal: AbortSignal.timeout(2000), cache: "no-store" });
        } catch {
            // fire-and-forget — never fail the caller on a tracking miss
        }
    }

    return new NextResponse(PIXEL, {
        status: 200,
        headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    });
}
