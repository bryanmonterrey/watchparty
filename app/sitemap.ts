import type { MetadataRoute } from "next";
import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { tokens } from "@/db/schema/content/token";
import { SITE_URL } from "@/lib/share/metadata";

// /sitemap.xml — the list of pages we want search engines to find. Before this
// existed the path fell through to the app and answered 200 with an HTML page,
// which Search Console reports as an invalid sitemap.
//
// Per request, not ISR: crawlers fetch it rarely, the two queries are small,
// and a build-time prerender would bake in whatever the CI build could (or
// couldn't) reach. The DB half is best-effort: if the query fails the static
// pages still ship, because an error here would hand crawlers a 500 for the
// one file they use to discover everything else.
export const dynamic = "force-dynamic";

// Public, signed-out-readable pages that exist regardless of data.
const STATIC_PATHS = [
    "/home",
    "/feed",
    "/about",
    "/creators",
    "/coins",
    "/live",
    "/explore",
    "/community",
    "/safety",
    "/investors",
    "/download",
    "/terms",
    "/privacy",
    "/cookies",
    "/guidelines",
    "/accessibility",
    "/ads-info",
];

// Well under the 50,000-URL cap per sitemap; revisit with generateSitemaps
// once either list gets near it.
const MAX_PROFILES = 5000;
const MAX_COINS = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
        url: `${SITE_URL}${path}`,
        changeFrequency: path === "/home" || path === "/feed" ? "hourly" : "monthly",
        priority: path === "/home" ? 1 : 0.6,
    }));

    try {
        const [profiles, coins] = await Promise.all([
            db
                .select({ username: user.username, updatedAt: user.updatedAt })
                .from(user)
                .where(and(isNotNull(user.username), or(isNull(user.banned), eq(user.banned, false))))
                .orderBy(desc(user.updatedAt))
                .limit(MAX_PROFILES),
            db
                .select({ id: tokens.id, address: tokens.tokenAddress, updatedAt: tokens.updatedAt })
                .from(tokens)
                .where(eq(tokens.status, "live"))
                .orderBy(desc(tokens.updatedAt))
                .limit(MAX_COINS),
        ]);

        for (const p of profiles) {
            if (!p.username) continue;
            entries.push({
                url: `${SITE_URL}/${encodeURIComponent(p.username)}`,
                lastModified: p.updatedAt ?? undefined,
                changeFrequency: "daily",
                priority: 0.7,
            });
        }
        // The coin page resolves either the mint address or the row id
        // (coin/[...slug] matches both), and a live coin isn't guaranteed to
        // have the address filled in — prefer it, fall back to the id.
        for (const c of coins) {
            entries.push({
                url: `${SITE_URL}/coin/${encodeURIComponent(c.address ?? c.id)}`,
                lastModified: c.updatedAt,
                changeFrequency: "hourly",
                priority: 0.5,
            });
        }
    } catch (err) {
        console.error("[sitemap] dynamic entries skipped:", (err as Error & { cause?: unknown }).cause ?? err);
    }

    return entries;
}
