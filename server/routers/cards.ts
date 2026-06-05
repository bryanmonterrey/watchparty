import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { videoCards, posts } from "@/db/schema/content";
import { eq, and, asc } from "drizzle-orm";

export const cardsRouter = router({
    list: publicProcedure
        .input(z.object({ postId: z.string() }))
        .query(async ({ input }) => {
            const rows = await db
                .select()
                .from(videoCards)
                .where(eq(videoCards.postId, input.postId))
                .orderBy(asc(videoCards.startTime));
            return { cards: rows };
        }),

    create: protectedProcedure
        .input(z.object({
            postId: z.string(),
            type: z.enum(["video", "playlist", "channel", "link", "poll"]),
            title: z.string().optional(),
            message: z.string().optional(),
            url: z.string().optional(),
            startTime: z.number().int().min(0),
            duration: z.number().int().min(1).max(60).default(5),
            sortOrder: z.number().int().default(0),
        }))
        .mutation(async ({ ctx, input }) => {
            const post = await db.query.posts.findFirst({
                where: and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id)),
            });
            if (!post) throw new TRPCError({ code: "FORBIDDEN" });

            const [card] = await db.insert(videoCards).values({
                postId: input.postId,
                type: input.type,
                title: input.title,
                message: input.message,
                url: input.url,
                startTime: input.startTime,
                duration: input.duration,
                sortOrder: input.sortOrder,
            }).returning();
            return { card };
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string(),
            type: z.enum(["video", "playlist", "channel", "link", "poll"]).optional(),
            title: z.string().optional(),
            message: z.string().optional(),
            url: z.string().optional().nullable(),
            startTime: z.number().int().min(0).optional(),
            duration: z.number().int().min(1).max(60).optional(),
            sortOrder: z.number().int().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const existing = await db.query.videoCards.findFirst({
                where: eq(videoCards.id, input.id),
            });
            if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

            const post = await db.query.posts.findFirst({
                where: and(eq(posts.id, existing.postId), eq(posts.userId, ctx.user.id)),
            });
            if (!post) throw new TRPCError({ code: "FORBIDDEN" });

            const { id, ...rest } = input;
            const [card] = await db
                .update(videoCards)
                .set({ ...rest, updatedAt: new Date() })
                .where(eq(videoCards.id, id))
                .returning();
            return { card };
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const existing = await db.query.videoCards.findFirst({
                where: eq(videoCards.id, input.id),
            });
            if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

            const post = await db.query.posts.findFirst({
                where: and(eq(posts.id, existing.postId), eq(posts.userId, ctx.user.id)),
            });
            if (!post) throw new TRPCError({ code: "FORBIDDEN" });

            await db.delete(videoCards).where(eq(videoCards.id, input.id));
            return { ok: true };
        }),
});
