/**
 * Drafts and scheduled posts: the two states a post can sit in before it is
 * published, and the transitions between them.
 *
 * Split out of server/routers/content.ts, which was 1580 lines against a
 * 1000-line guard. Pure move — these procedures are byte-identical to what
 * lived there, and they are spread back into the same router, so every caller
 * path (trpc.content.*) is unchanged.
 */
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { db } from "@/db";
import { posts } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, desc, and } from "drizzle-orm";
import { invalidateCache } from "@/lib/cache";

export const draftProcedures = {
    getDrafts: protectedProcedure.query(async ({ ctx }) => {
        return db
            .select()
            .from(posts)
            .where(and(eq(posts.userId, ctx.user.id), eq(posts.status, "draft")))
            .orderBy(desc(posts.updatedAt));
    }),

    deleteDraft: protectedProcedure
        .input(z.object({ postId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(posts).where(and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id), eq(posts.status, "draft")));
            return { success: true };
        }),

    publishDraft: protectedProcedure
        .input(z.object({ postId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.update(posts)
                .set({ status: "published", updatedAt: new Date() })
                .where(and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id), eq(posts.status, "draft")));
            await Promise.all([
                invalidateCache("db:feed:v2:for-you:initial:20"),
                invalidateCache("db:feed:v2:following:initial:20"),
                invalidateCache("db:feed:v2:news:initial:20"),
            ]);
            return { success: true };
        }),

    getScheduledPosts: protectedProcedure.query(async ({ ctx }) => {
        return db
            .select()
            .from(posts)
            .where(and(eq(posts.userId, ctx.user.id), eq(posts.status, "scheduled")))
            .orderBy(posts.scheduledFor);
    }),

    cancelScheduled: protectedProcedure
        .input(z.object({ postId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(posts).where(and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id), eq(posts.status, "scheduled")));
            return { success: true };
        }),

    reschedulePost: protectedProcedure
        .input(z.object({ postId: z.string(), scheduledFor: z.date() }))
        .mutation(async ({ ctx, input }) => {
            await db.update(posts)
                .set({ scheduledFor: input.scheduledFor, updatedAt: new Date() })
                .where(and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id), eq(posts.status, "scheduled")));
            return { success: true };
        }),
};
