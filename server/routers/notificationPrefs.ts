import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { db } from '@/db';
import { notificationPrefs, webPushSubscriptions } from '@/db/schema/content/notification_prefs';
import { tokenAlertSubscriptions } from '@/db/schema/content/token';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const notificationPrefsRouter = router({

    get: protectedProcedure.query(async ({ ctx }) => {
        const row = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, ctx.user.id)).limit(1);
        return row[0] ?? {
            likes: true, comments: true, reposts: true, follows: true,
            tips: true, mentions: true, quotes: true, system: true, pushEnabled: false,
        };
    }),

    update: protectedProcedure
        .input(z.object({
            likes: z.boolean().optional(),
            comments: z.boolean().optional(),
            reposts: z.boolean().optional(),
            follows: z.boolean().optional(),
            tips: z.boolean().optional(),
            mentions: z.boolean().optional(),
            quotes: z.boolean().optional(),
            system: z.boolean().optional(),
            pushEnabled: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const filtered = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
            await db.insert(notificationPrefs)
                .values({ id: nanoid(), userId: ctx.user.id, ...filtered })
                .onConflictDoUpdate({ target: notificationPrefs.userId, set: filtered });
            return { success: true };
        }),

    subscribePush: protectedProcedure
        .input(z.object({ endpoint: z.string().url(), p256dh: z.string(), auth: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.insert(webPushSubscriptions)
                .values({ id: nanoid(), userId: ctx.user.id, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth })
                .onConflictDoUpdate({ target: webPushSubscriptions.endpoint, set: { userId: ctx.user.id, p256dh: input.p256dh, auth: input.auth } });
            await db.insert(notificationPrefs)
                .values({ id: nanoid(), userId: ctx.user.id, pushEnabled: true })
                .onConflictDoUpdate({ target: notificationPrefs.userId, set: { pushEnabled: true } });
            return { success: true };
        }),

    unsubscribePush: protectedProcedure
        .input(z.object({ endpoint: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(webPushSubscriptions).where(eq(webPushSubscriptions.endpoint, input.endpoint));
            return { success: true };
        }),

    // ─── Per-token coin alerts (price moves + migration) ───

    getTokenAlert: protectedProcedure
        .input(z.object({ tokenId: z.string() }))
        .query(async ({ ctx, input }) => {
            const [row] = await db
                .select({ tokenId: tokenAlertSubscriptions.tokenId })
                .from(tokenAlertSubscriptions)
                .where(and(eq(tokenAlertSubscriptions.userId, ctx.user.id), eq(tokenAlertSubscriptions.tokenId, input.tokenId)))
                .limit(1);
            return { subscribed: !!row };
        }),

    setTokenAlert: protectedProcedure
        .input(z.object({ tokenId: z.string(), enabled: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            if (input.enabled) {
                await db
                    .insert(tokenAlertSubscriptions)
                    .values({ userId: ctx.user.id, tokenId: input.tokenId })
                    .onConflictDoNothing();
            } else {
                await db
                    .delete(tokenAlertSubscriptions)
                    .where(and(eq(tokenAlertSubscriptions.userId, ctx.user.id), eq(tokenAlertSubscriptions.tokenId, input.tokenId)));
            }
            return { subscribed: input.enabled };
        }),
});
