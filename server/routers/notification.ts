import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { notifications } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, desc, and, lt } from "drizzle-orm";
import { nanoid } from "nanoid";

export const notificationRouter = router({
    getNotifications: protectedProcedure
        .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(30) }))
        .query(async ({ ctx, input }) => {
            const cursorDate = input.cursor ? new Date(input.cursor) : undefined;

            const rows = await db
                .select({
                    id: notifications.id,
                    type: notifications.type,
                    postId: notifications.postId,
                    commentId: notifications.commentId,
                    body: notifications.body,
                    isRead: notifications.isRead,
                    createdAt: notifications.createdAt,
                    actor: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                    },
                })
                .from(notifications)
                .leftJoin(user, eq(notifications.actorId, user.id))
                .where(and(
                    eq(notifications.userId, ctx.user.id),
                    cursorDate ? lt(notifications.createdAt, cursorDate) : undefined,
                ))
                .orderBy(desc(notifications.createdAt))
                .limit(input.limit + 1);

            let nextCursor: string | undefined;
            if (rows.length > input.limit) {
                const next = rows.pop();
                nextCursor = next?.createdAt.toISOString();
            }

            return { notifications: rows, nextCursor };
        }),

    getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
        const rows = await db
            .select({ id: notifications.id })
            .from(notifications)
            .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false)))
            .limit(100);
        return { count: rows.length };
    }),

    markRead: protectedProcedure
        .input(z.object({ notificationId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db
                .update(notifications)
                .set({ isRead: true })
                .where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, ctx.user.id)));
            return { success: true };
        }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
        await db
            .update(notifications)
            .set({ isRead: true })
            .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false)));
        return { success: true };
    }),
});
