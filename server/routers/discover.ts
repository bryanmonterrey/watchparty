import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/db";
import { posts } from "@/db/schema/content/post";
import { and, eq, gt, desc, sql } from "drizzle-orm";
import { withCache } from "@/lib/cache";

export type TrendingItem = { title: string; meta: string; count?: number };

// GLM worker (Cloudflare) generates the editorial "Today's News / What's
// happening" copy. Configure `GLM_WORKER_URL` (POST endpoint) — and optionally
// `GLM_WORKER_TOKEN` for a bearer — to switch the card from DB-derived trends to
// model-generated news. The worker is expected to accept
// `{ task: "trending_news", count }` and return `{ items: TrendingItem[] }`
// (or a bare array). Any failure / missing env falls back to real DB trends, so
// the card is never empty and never blocks the rail.
async function glmTrending(count: number): Promise<TrendingItem[] | null> {
    const url = process.env.GLM_WORKER_URL;
    if (!url) return null;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...(process.env.GLM_WORKER_TOKEN ? { authorization: `Bearer ${process.env.GLM_WORKER_TOKEN}` } : {}),
            },
            body: JSON.stringify({ task: "trending_news", count }),
            signal: AbortSignal.timeout(4500),
        });
        if (!res.ok) return null;
        const data: unknown = await res.json();
        const raw = Array.isArray(data) ? data : Array.isArray((data as any)?.items) ? (data as any).items : null;
        if (!raw) return null;
        return (raw as any[])
            .map((it) => ({
                title: String(it?.title ?? it?.headline ?? "").slice(0, 140),
                meta: String(it?.meta ?? it?.category ?? "Trending"),
                count: typeof it?.count === "number" ? it.count : undefined,
            }))
            .filter((it) => it.title)
            .slice(0, count);
    } catch {
        return null;
    }
}

// Fallback: real trending hashtags across the last 48h of public posts. Bounded
// scan (latest 1000), counted per-post (a tag repeated in one post counts once).
async function hashtagTrending(count: number): Promise<TrendingItem[]> {
    const since = new Date(Date.now() - 48 * 3600 * 1000);
    const rows = await db
        .select({ content: posts.content })
        .from(posts)
        .where(and(eq(posts.status, "published"), gt(posts.createdAt, since), sql`${posts.content} LIKE '%#%'`))
        .orderBy(desc(posts.createdAt))
        .limit(1000);

    const counts = new Map<string, number>();
    for (const r of rows) {
        const tags = r.content?.match(/#([a-zA-Z0-9_]{2,30})/g);
        if (!tags) continue;
        for (const t of new Set(tags.map((x) => x.toLowerCase()))) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
        }
    }

    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([tag, c]) => ({ title: tag, meta: "Trending on watchparty", count: c }));
}

export const discoverRouter = router({
    // "Today's News / What's happening" — GLM-generated when configured, else
    // real on-platform trends. Cached 5min so the rail is cheap on every load.
    trending: publicProcedure
        .input(z.object({ limit: z.number().min(1).max(10).default(5) }).optional())
        .query(async ({ input }) => {
            const count = input?.limit ?? 5;
            return withCache(`discover:trending:v1:${count}`, 300, async () => {
                const glm = await glmTrending(count);
                if (glm && glm.length) return { source: "glm" as const, items: glm };
                return { source: "trends" as const, items: await hashtagTrending(count) };
            });
        }),
});
