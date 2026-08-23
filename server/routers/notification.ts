import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { notifications } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, desc, and, asc, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { takePage } from "@/server/lib/paginate";
import { encodeKeysetCursor, parseKeysetCursor, keysetAfter } from "@/server/lib/keyset";

/**
 * The notification `type` column is a literal union, not free text — so the
 * filter below is an enum, and a caller asking for a type that cannot exist is
 * a validation error rather than a query that quietly matches nothing.
 * Mirrors NotifType in server/lib/notify.ts; keep the two together.
 */
const NOTIF_TYPES = [
    "follow", "like", "comment", "repost", "mention", "quote", "callout", "trade", "system",
] as const;

export const notificationRouter = router({
    getNotifications: protectedProcedure
        .input(z.object({
            cursor: z.string().optional(),
            limit: z.number().min(1).max(50).default(30),
            /**
             * Narrow to specific notification types — the studio's activity
             * feed wants follows and on-chain trades, not every like.
             *
             * Filtered in SQL rather than by the caller: a creator whose last
             * fifty notifications are all likes would otherwise get an empty
             * feed off a full page, and paging until something matched would
             * cost a request per page. Omitted means everything, which is what
             * the notifications page asks for.
             */
            types: z.array(z.enum(NOTIF_TYPES)).min(1).max(NOTIF_TYPES.length).optional(),
        }))
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
                    input.types ? inArray(notifications.type, input.types) : undefined,
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
