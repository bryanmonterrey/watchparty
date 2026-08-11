import { z } from "zod";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { posts } from "@/db/schema";

// Studio-only reads. Kept out of server/routers/content.ts on purpose — that
// router is already past the file-size guard's line and grandfathered at its
// current size, so new studio surfaces land here instead of growing it.
export const studioRouter = router({
    // Per-video performance for the studio Insights tab: the owner's published
    // videos ranked by views, with engagement. Distinct from content.
    // getVideosByUser (public, profile rail, capped at 20) — this is the owner's
    // private performance view over the full engagement set.
    getVideoInsights: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
        .query(async ({ ctx, input }) => {
            return db
                .select({
                    id: posts.id,
                    title: posts.title,
                    thumbnailUrl: posts.thumbnailUrl,
                    duration: posts.duration,
                    views: posts.views,
                    likes: posts.likes,
                    comments: posts.comments,
                    reposts: posts.reposts,
                    createdAt: posts.createdAt,
                })
                .from(posts)
                .where(and(
                    eq(posts.userId, ctx.user.id),
                    eq(posts.status, "published"),
                    isNotNull(posts.videoUrl),
                ))
                .orderBy(desc(posts.views))
                .limit(input?.limit ?? 50);
        }),
});
