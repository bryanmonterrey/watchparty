import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { stories, storyViews } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, desc, and, gt, sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

export const storyRouter = router({
    // Get active stories grouped by user (for the stories bar)
    getActiveStories: publicProcedure.query(async () => {
        const now = new Date();
        const rows = await db
            .select({
                id: stories.id,
                userId: stories.userId,
                mediaUrl: stories.mediaUrl,
                mediaType: stories.mediaType,
                caption: stories.caption,
                views: stories.views,
                expiresAt: stories.expiresAt,
                createdAt: stories.createdAt,
                user: {
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    avatar_url: user.avatar_url,
                },
            })
            .from(stories)
            .innerJoin(user, eq(stories.userId, user.id))
            .where(gt(stories.expiresAt, now))
            .orderBy(desc(stories.createdAt));
        return { stories: rows };
    }),

    getUserStories: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ input }) => {
            const now = new Date();
            const rows = await db
                .select()
                .from(stories)
                .where(and(eq(stories.userId, input.userId), gt(stories.expiresAt, now)))
                .orderBy(desc(stories.createdAt));
            return { stories: rows };
        }),

    createStory: protectedProcedure
        .input(z.object({
            mediaUrl: z.string().url(),
            mediaType: z.enum(["image", "video"]).default("image"),
            caption: z.string().max(200).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
            const storyId = nanoid();
            await db.insert(stories).values({
                id: storyId,
                userId: ctx.user.id,
                mediaUrl: input.mediaUrl,
                mediaType: input.mediaType,
                caption: input.caption,
                expiresAt,
            });
            return { success: true, storyId };
        }),

    viewStory: protectedProcedure
        .input(z.object({ storyId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const existing = await db.query.storyViews.findFirst({
                where: and(eq(storyViews.storyId, input.storyId), eq(storyViews.userId, ctx.user.id)),
            });
            if (!existing) {
                await db.insert(storyViews).values({ id: nanoid(), storyId: input.storyId, userId: ctx.user.id });
                await db.update(stories)
                    .set({ views: sql`${stories.views} + 1` })
                    .where(eq(stories.id, input.storyId));
            }
            return { success: true };
        }),

    getViewedStoryIds: protectedProcedure
        .input(z.object({ storyIds: z.array(z.string()) }))
        .query(async ({ ctx, input }) => {
            if (input.storyIds.length === 0) return { viewedIds: [] };
            const rows = await db
                .select({ storyId: storyViews.storyId })
                .from(storyViews)
                .where(and(eq(storyViews.userId, ctx.user.id), inArray(storyViews.storyId, input.storyIds)));
            return { viewedIds: rows.map(r => r.storyId) };
        }),

    deleteStory: protectedProcedure
        .input(z.object({ storyId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(stories).where(and(eq(stories.id, input.storyId), eq(stories.userId, ctx.user.id)));
            return { success: true };
        }),
});
