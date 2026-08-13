/**
 * Caption tracks for a video — read, add, delete.
 *
 * Split out of server/routers/content.ts, which was 1580 lines against a
 * 1000-line guard. Pure move — these procedures are byte-identical to what
 * lived there, and they are spread back into the same router, so every caller
 * path (trpc.content.*) is unchanged.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure } from "../../trpc";
import { db } from "@/db";
import { posts, videoCaptions } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, and, asc } from "drizzle-orm";

export const captionProcedures = {
    // ── Caption tracks ────────────────────────────────────────────────────────

    getCaptions: publicProcedure
        .input(z.object({ postId: z.string() }))
        .query(async ({ input }) => {
            const rows = await db
                .select()
                .from(videoCaptions)
                .where(eq(videoCaptions.postId, input.postId))
                .orderBy(asc(videoCaptions.isDefault));
            return { captions: rows };
        }),

    addCaption: protectedProcedure
        .input(z.object({
            postId: z.string(),
            language: z.string().min(2).max(10),
            label: z.string().min(1).max(100),
            url: z.string().url(),
            isDefault: z.boolean().default(false),
        }))
        .mutation(async ({ ctx, input }) => {
            const post = await db.query.posts.findFirst({
                where: and(eq(posts.id, input.postId), eq(posts.userId, ctx.session.user.id)),
                columns: { id: true },
            });
            if (!post) throw new TRPCError({ code: "FORBIDDEN" });
            await db.insert(videoCaptions).values({
                postId: input.postId,
                language: input.language,
                label: input.label,
                url: input.url,
                isDefault: input.isDefault,
            });
            return { success: true };
        }),

    deleteCaption: protectedProcedure
        .input(z.object({ captionId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const caption = await db.query.videoCaptions.findFirst({
                where: eq(videoCaptions.id, input.captionId),
            });
            if (!caption) throw new TRPCError({ code: "NOT_FOUND" });
            const post = await db.query.posts.findFirst({
                where: and(eq(posts.id, caption.postId), eq(posts.userId, ctx.session.user.id)),
                columns: { id: true },
            });
            if (!post) throw new TRPCError({ code: "FORBIDDEN" });
            await db.delete(videoCaptions).where(eq(videoCaptions.id, input.captionId));
            return { success: true };
        }),
};
