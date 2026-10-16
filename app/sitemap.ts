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
// Dynamic route, cached in memory. Not ISR: open-next.config.ts configures no
// incremental cache, so `revalidate` would not persist between requests, and a
// build-time prerender would bake in whatever CI could (or couldn't) reach.
// Not uncached either: scanners fetch /sitemap.xml freely, and each miss is two
// 5,000-row queries — so one isolate answers from memory for an hour.
//
// The DB half is best-effort: if the query fails the static pages still ship
// (and that partial result is NOT cached), because an error here would hand
// crawlers a 500 for the one file they use to discover everything else.
export const dynamic = "force-dynamic";

const CACHE_MS = 60 * 60 * 1000;
let cached: { at: number; entries: MetadataRoute.Sitemap } | null = null;

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
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.entries;

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
                // Bots are developer-platform accounts posting automated content —
                // real profiles, but not pages to send searchers to.
                .where(
                    and(
                        isNotNull(user.username),
                        or(isNull(user.banned), eq(user.banned, false)),
                        eq(user.isBot, false),
                    ),
                )
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
        cached = { at: Date.now(), entries };
    } catch (err) {
        console.error("[sitemap] dynamic entries skipped:", (err as Error & { cause?: unknown }).cause ?? err);
    }

    return entries;
}
