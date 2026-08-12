import { ImageResponse } from "workers-og";

// Standalone OG share-image worker. Renders the same post-share card the Next
// app used to render at /api/og/post via `next/og` — moved here to keep
// next/og's ~1 MiB of wasm out of the main worker bundle (see wrangler.jsonc).
//
// workers-og is the Workers-native Satori+resvg renderer; unlike next/og it
// takes an HTML STRING (no React), which keeps this worker tiny. The card
// markup below mirrors the original JSX 1:1 (1200×630, white card on black,
// avatar + name + handle header, post text body).

/** Escape user-supplied text for safe interpolation into the HTML template —
 *  an unescaped `<` or `"` in a post would otherwise break the parse. */
function esc(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function card({ text, name, username, avatar }: {
    text: string;
    name: string;
    username: string;
    avatar: string;
}): string {
    const handle = username.startsWith("@") ? username : `@${username}`;
    const avatarEl = avatar
        ? `<img src="${esc(avatar)}" style="width:80px;height:80px;border-radius:40px;object-fit:cover;margin-right:24px" />`
        : `<div style="width:80px;height:80px;border-radius:40px;background-color:#e5e7eb;margin-right:24px"></div>`;
    return `
    <div style="height:100%;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background-color:#000000;color:white">
      <div style="display:flex;flex-direction:column;background-color:#ffffff;color:#000000;width:800px;min-height:400px;border-radius:24px;padding:48px;box-shadow:0 20px 40px rgba(0,0,0,0.5)">
        <div style="display:flex;align-items:center;margin-bottom:32px">
          ${avatarEl}
          <div style="display:flex;flex-direction:column">
            <span style="font-size:32px;font-weight:bold;color:#09090b;margin-bottom:4px">${esc(name)}</span>
            <span style="font-size:24px;color:#71717a">${esc(handle)}</span>
          </div>
        </div>
        <div style="display:flex;font-size:36px;line-height:1.4;color:#09090b">${esc(text)}</div>
      </div>
    </div>`;
}

export default {
    async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        // Only the post card path is served; anything else under /api/og is a
        // 404 (the zone route is a wildcard, so be explicit).
        if (url.pathname !== "/api/og/post") {
            return new Response("Not found", { status: 404 });
        }
        try {
            const p = url.searchParams;
            const html = card({
                text: (p.get("text") || "Just another amazing post on Watchparty!").slice(0, 280),
                name: (p.get("name") || "Creator").slice(0, 80),
                username: (p.get("username") || "@creator").slice(0, 80),
                avatar: p.get("avatar") || "",
            });
            const res = new ImageResponse(html, { width: 1200, height: 630 });
            // Materialize the PNG fully before responding. Rewrapping
            // `res.body` (a ReadableStream) into a new Response streamed EMPTY
            // (0-byte 200s, verified in prod) — the satori/resvg render must be
            // drained here, not piped through a reconstructed Response.
            const png = await res.arrayBuffer();
            // Share previews are re-fetched by every platform's crawler and are
            // effectively immutable per URL — cache hard at the edge.
            return new Response(png, {
                status: 200,
                headers: {
                    "content-type": "image/png",
                    "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
                },
            });
        } catch {
            return new Response("Failed to generate image", { status: 500 });
        }
    },
};
