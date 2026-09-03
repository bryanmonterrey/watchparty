import { ImageResponse } from "workers-og";
import { Q } from "./params";
import { loadImage } from "./images";
import { fonts } from "./fonts";
import { post } from "./templates/post";
import { profile } from "./templates/profile";
import { live } from "./templates/live";
import { coin } from "./templates/coin";
import { market } from "./templates/market";
import { community } from "./templates/community";
import { category } from "./templates/category";
import { pnl } from "./templates/pnl";
import type { Template } from "./templates/types";

// Standalone OG share-image worker — the renderer for every generated card
// (docs/share-cards-plan.md). Lives outside the Next app so satori's wasm
// stays out of the main worker bundle (wrangler.jsonc explains the route).
//
// URL contract: /api/og/<template>?<fields>&v=<n>. Fields travel in the URL
// (the page's generateMetadata already holds the row), so a card URL is
// immutable and cached hard at the edge; `v` is bumped when a template's
// design changes so crawlers that re-fetch get the new render.
//
// Local dev: `bunx wrangler dev --port 8787` here, and the Next app's dev
// rewrite sends /api/og/* to it. RESTART it after editing source rather than
// relying on hot reload — resvg's wasm may only be initialised once per
// isolate, and a reload re-runs it ("Already initialized. The `initWasm()`
// function can be used only once"), after which every render 500s.
//
// Element tree, NOT an HTML string: workers-og's HTML parser drops
// `display: flex` on multi-child containers (satori then throws). Templates
// build plain React-shaped objects through src/h.ts.

const TEMPLATES: Record<string, Template> = { post, profile, live, coin, market, community, category, pnl };

// workers-og initialises resvg's wasm lazily inside EVERY ImageResponse and
// guards it with a module flag that is set only AFTER the async instantiate
// resolves — so two renders that start on a cold isolate before the first
// init lands both pass the flag check and double-initialise. One shared
// warm-up promise makes the first render happen alone; everything after
// awaits it. (After that, workers-og's own catch swallows its "Already
// initialized. The `initWasm()` function can be used only once." and logs
// the stack on every render — that line in the worker log is expected noise,
// not a failure.)
let warm: Promise<void> | null = null;
function ensureWarm(): Promise<void> {
    if (!warm) {
        warm = new ImageResponse({ type: "div", props: { style: { width: 2, height: 2, display: "flex" } } } as unknown as string, {
            width: 2,
            height: 2,
            fonts,
        })
            .arrayBuffer()
            .then(() => undefined)
            .catch((err) => {
                warm = null; // let the next request retry the init
                throw err;
            });
    }
    return warm;
}

// Bump when any template's design changes (and OG_TEMPLATE_VERSION in
// lib/share/og-url.ts). Not exported: workerd rejects any named export from
// the entry module that is not a handler.
const TEMPLATE_VERSION = 1;

export default {
    async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const m = /^\/api\/og\/([a-z]+)\/?$/.exec(url.pathname);
        const template = m ? TEMPLATES[m[1]] : undefined;
        if (!template) return new Response("Not found", { status: 404 });

        try {
            await ensureWarm();
            const { el, size } = await template({ q: new Q(url.searchParams), image: loadImage });
            const res = new ImageResponse(el as unknown as string, {
                width: size.width,
                height: size.height,
                fonts,
                emoji: "twemoji",
            });
            // Materialize the PNG fully before responding: rewrapping
            // `res.body` streamed EMPTY (0-byte 200s, verified in prod).
            const png = await res.arrayBuffer();
            return new Response(png, {
                status: 200,
                headers: {
                    "content-type": "image/png",
                    "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
                    "x-og-template": `${m![1]}@${TEMPLATE_VERSION}`,
                },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("og render failed", m![1], message);
            return new Response(`Failed to generate image: ${message}`, {
                status: 500,
                headers: { "content-type": "text/plain", "cache-control": "no-store" },
            });
        }
    },
};
