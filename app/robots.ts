import type { MetadataRoute } from "next";
import { ALWAYS_PRIVATE_PREFIXES } from "@/lib/auth/public-browsing";
import { SITE_URL } from "@/lib/share/metadata";

// /robots.txt. Before this existed the route 404'd, which crawlers read as
// "allow everything" — harmless, but it also meant no pointer to the sitemap.
//
// /api/ is deliberately NOT disallowed: Googlebot renders pages with JS and
// fetches the same tRPC calls a browser does. Blocking them would index the
// skeleton instead of the content.

// Signed-in-only surfaces (they bounce to /login anyway) and internal tooling.
const PRIVATE = [...ALWAYS_PRIVATE_PREFIXES, "/dev", "/admin", "/studio"];

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                // robots.txt rules are PREFIX matches, and profiles live at
                // /<username> — a bare "/dev" would also block /developer and
                // a user called "devon". So each path is blocked exactly ($)
                // and as a directory (/), never as a prefix.
                disallow: PRIVATE.flatMap((p) => [`${p}$`, `${p}/`]),
            },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
