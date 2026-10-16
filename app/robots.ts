import type { MetadataRoute } from "next";
import { ALWAYS_PRIVATE_PREFIXES } from "@/lib/auth/public-browsing";
import { SITE_URL } from "@/lib/share/metadata";

// /robots.txt. Before this existed the route 404'd, which crawlers read as
// "allow everything" — harmless, but it also meant no pointer to the sitemap.
//
// /api/ is deliberately NOT disallowed: Googlebot renders pages with JS and
// fetches the same tRPC calls a browser does. Blocking them would index the
// skeleton instead of the content.
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                // Signed-in-only surfaces (they bounce to /login anyway) and
                // internal tooling — nothing here is meant to be found.
                disallow: [...ALWAYS_PRIVATE_PREFIXES, "/dev", "/admin", "/studio", "/login?"],
            },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
