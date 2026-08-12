import { ImageResponse } from "workers-og";

// Standalone OG share-image worker. Renders the same post-share card the Next
// app used to render at /api/og/post via `next/og` — moved here to keep
// next/og's ~1 MiB of wasm out of the main worker bundle (see wrangler.jsonc).
//
// Element tree, NOT an HTML string: workers-og also accepts an HTML string,
// but its HTML/CSS string parser mishandles multi-child flex containers (it
// dropped `display: flex` and satori then threw "Expected <div> to have
// explicit display: flex if it has more than one child node" — regardless of
// whitespace or `property: value` spacing). satori's real input is a
// React-element shape: `{ type, props: { style, children } }`. We build that
// as plain objects (no React dependency) with camelCase style keys — the exact
// tree the original next/og JSX compiled to, so rendering is unambiguous.

type Node = {
    type: string;
    props: { style: Record<string, unknown>; children?: unknown };
};

const el = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
    type,
    props: { style, ...(children !== undefined ? { children } : {}) },
});

function card({ text, name, username, avatar }: {
    text: string;
    name: string;
    username: string;
    avatar: string;
}): Node {
    const handle = username.startsWith("@") ? username : `@${username}`;
    const avatarNode = avatar
        ? el("img", { width: 80, height: 80, borderRadius: 40, objectFit: "cover", marginRight: 24 } as Record<string, unknown> & { src?: string })
        : el("div", { width: 80, height: 80, borderRadius: 40, backgroundColor: "#e5e7eb", marginRight: 24 });
    // `src` lives on props, not style, for the <img>.
    if (avatar) (avatarNode.props as Record<string, unknown>).src = avatar;

    return el(
        "div",
        {
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000000",
            color: "white",
        },
        el(
            "div",
            {
                display: "flex",
                flexDirection: "column",
                backgroundColor: "#ffffff",
                color: "#000000",
                width: 800,
                minHeight: 400,
                borderRadius: 24,
                padding: 48,
                boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            },
            [
                el("div", { display: "flex", alignItems: "center", marginBottom: 32 }, [
                    avatarNode,
                    el("div", { display: "flex", flexDirection: "column" }, [
                        el("span", { fontSize: 32, fontWeight: 700, color: "#09090b", marginBottom: 4 }, name),
                        el("span", { fontSize: 24, color: "#71717a" }, handle),
                    ]),
                ]),
                el("div", { display: "flex", fontSize: 36, lineHeight: 1.4, color: "#09090b" }, text),
            ],
        ),
    );
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
            const element = card({
                text: (p.get("text") || "Just another amazing post on Watchparty!").slice(0, 280),
                name: (p.get("name") || "Creator").slice(0, 80),
                username: (p.get("username") || "@creator").slice(0, 80),
                avatar: p.get("avatar") || "",
            });
            const res = new ImageResponse(element as unknown as string, { width: 1200, height: 630 });
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
