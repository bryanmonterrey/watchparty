import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import { Q } from "@/lib/og/params";
import { loadImage } from "@/lib/og/images";
import { fonts } from "@/lib/og/fonts";
import { post } from "@/lib/og/templates/post";
import { profile } from "@/lib/og/templates/profile";
import { live } from "@/lib/og/templates/live";
import { coin } from "@/lib/og/templates/coin";
import { market } from "@/lib/og/templates/market";
import { community } from "@/lib/og/templates/community";
import { category } from "@/lib/og/templates/category";
import { pnl } from "@/lib/og/templates/pnl";
import type { Template } from "@/lib/og/templates/types";

// OG share-image renderer for every generated card (docs/share-cards-plan.md).
// It was a standalone Cloudflare worker (og-worker/) only to keep satori's wasm
// under the Workers 10 MiB bundle cap; on Vercel it is an ordinary route.
//
// URL contract: /api/og/<template>?<fields>&v=<n>. Fields travel in the URL
// (the page's generateMetadata already holds the row), so a card URL is
// immutable and cached hard at the edge; `v` is bumped when a template's
// design changes so crawlers that re-fetch get the new render.
//
// Templates build plain React-shaped element objects through lib/og/h.ts
// (no JSX) — satori consumes those directly.

export const runtime = "nodejs";

const TEMPLATES: Record<string, Template> = { post, profile, live, coin, market, community, category, pnl };

// Bump when any template's design changes (and OG_TEMPLATE_VERSION in
// lib/share/og-url.ts).
const TEMPLATE_VERSION = 1;

export async function GET(req: Request, ctx: { params: Promise<{ template: string }> }) {
    const { template: name } = await ctx.params;
    const template = TEMPLATES[name];
    if (!template) return new Response("Not found", { status: 404 });

    try {
        const { searchParams } = new URL(req.url);
        const { el, size } = await template({ q: new Q(searchParams), image: loadImage });
        const res = new ImageResponse(el as unknown as ReactElement, {
            width: size.width,
            height: size.height,
            fonts: await fonts(),
            emoji: "twemoji",
            headers: {
                "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
                "x-og-template": `${name}@${TEMPLATE_VERSION}`,
            },
        });
        // Materialize before responding so a satori failure mid-render lands
        // in the catch below instead of truncating a 200.
        const png = await res.arrayBuffer();
        return new Response(png, { status: 200, headers: res.headers });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("og render failed", name, message);
        return new Response(`Failed to generate image: ${message}`, {
            status: 500,
            headers: { "content-type": "text/plain", "cache-control": "no-store" },
        });
    }
}
