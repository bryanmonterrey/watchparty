import { NextRequest, NextResponse } from "next/server";
import ogs from "open-graph-scraper";
import { redis } from "@/lib/cache";

const TTL = 86400; // 24h

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get("url");
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

    // Validate URL
    try { new URL(url); } catch { return NextResponse.json({ error: "Invalid url" }, { status: 400 }); }

    const cacheKey = `og:${Buffer.from(url).toString("base64").slice(0, 64)}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) return NextResponse.json(cached);
    } catch { /* redis miss */ }

    try {
        const { result } = await ogs({ url, timeout: 5000 });

        const preview = {
            url,
            title: result.ogTitle ?? result.twitterTitle ?? null,
            description: result.ogDescription ?? result.twitterDescription ?? null,
            imageUrl: result.ogImage?.[0]?.url ?? result.twitterImage?.[0]?.url ?? null,
            siteName: result.ogSiteName ?? null,
        };

        try { await redis.set(cacheKey, preview, { ex: TTL }); } catch { /* ignore */ }

        return NextResponse.json(preview);
    } catch {
        return NextResponse.json({ error: "Failed to fetch preview" }, { status: 500 });
    }
}
