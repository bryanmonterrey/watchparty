import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { notifications } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, desc, and, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { takePage } from "@/server/lib/paginate";
import { encodeKeysetCursor, parseKeysetCursor, keysetAfter } from "@/server/lib/keyset";

export const notificationRouter = router({
    getNotifications: protectedProcedure
        .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(30) }))
        .query(async ({ ctx, input }) => {
            const key = parseKeysetCursor(input.cursor, "date"); // composite (createdAt, id) — server/lib/keyset.ts

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
                    keysetAfter(notifications.createdAt, notifications.id, key),
                ))
                .orderBy(desc(notifications.createdAt), asc(notifications.id))
                .limit(input.limit + 1);

            const { items, hasMore, lastItem } = takePage(rows, input.limit);
            const nextCursor = hasMore ? encodeKeysetCursor(lastItem!.createdAt, lastItem!.id) : undefined;

            return { notifications: items, nextCursor };
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
