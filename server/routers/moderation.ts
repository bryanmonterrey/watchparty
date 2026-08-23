import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '../trpc';
import { db } from '@/db';
import { blocks, mutes, hiddenPosts, reports, verificationRequests, creatorBans } from '@/db/schema/content/moderation';
import { follows } from '@/db/schema/content/follow';
import { user } from '@/db/schema/auth/user';
import { and, eq, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { logModAction } from "@/server/lib/mod-log";
import { moderationActions } from "@/db/schema/content/moderation-action";

export const moderationRouter = router({
    // ─── Block ──────────────────────────────────────────────────────────────

    block: protectedProcedure
        .input(z.object({ userId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.id === input.userId) throw new Error("Cannot block yourself");
            await db.insert(blocks).values({
                id: nanoid(),
                blockerId: ctx.user.id,
                blockedId: input.userId,
            }).onConflictDoNothing();
            // Remove any follows between them
            await db.delete(follows).where(
                and(eq(follows.followerId, ctx.user.id), eq(follows.followingId, input.userId))
            );
            await db.delete(follows).where(
                and(eq(follows.followerId, input.userId), eq(follows.followingId, ctx.user.id))
            );
            return { success: true };
        }),

    unblock: protectedProcedure
        .input(z.object({ userId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(blocks).where(
                and(eq(blocks.blockerId, ctx.user.id), eq(blocks.blockedId, input.userId))
            );
            return { success: true };
        }),

    isBlocked: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ ctx, input }) => {
            if (!ctx.user) return { blockedByMe: false, blockedByThem: false };
            const [byMe, byThem] = await Promise.all([
                db.select({ id: blocks.id }).from(blocks)
                    .where(and(eq(blocks.blockerId, ctx.user.id), eq(blocks.blockedId, input.userId)))
                    .limit(1),
                db.select({ id: blocks.id }).from(blocks)
                    .where(and(eq(blocks.blockerId, input.userId), eq(blocks.blockedId, ctx.user.id)))
                    .limit(1),
            ]);
            return { blockedByMe: byMe.length > 0, blockedByThem: byThem.length > 0 };
        }),

    getBlocked: protectedProcedure.query(async ({ ctx }) => {
        const { user } = await import('@/db/schema');
        const rows = await db
            .select({ id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url, blockedAt: blocks.createdAt })
            .from(blocks)
            .innerJoin(user, eq(blocks.blockedId, user.id))
            .where(eq(blocks.blockerId, ctx.user.id));
        return rows;
    }),

    // ─── Mute ───────────────────────────────────────────────────────────────

    mute: protectedProcedure
        .input(z.object({
            userId: z.string(),
            muteNotifications: z.boolean().default(true),
            muteStories: z.boolean().default(true),
        }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.id === input.userId) throw new Error("Cannot mute yourself");
            await db.insert(mutes).values({
                id: nanoid(),
                muterId: ctx.user.id,
                mutedId: input.userId,
                muteNotifications: input.muteNotifications,
                muteStories: input.muteStories,
            }).onConflictDoNothing();
            return { success: true };
        }),

    unmute: protectedProcedure
        .input(z.object({ userId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(mutes).where(
                and(eq(mutes.muterId, ctx.user.id), eq(mutes.mutedId, input.userId))
            );
            return { success: true };
        }),

    isMuted: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ ctx, input }) => {
            if (!ctx.user) return { muted: false };
            const row = await db.select({ id: mutes.id, muteNotifications: mutes.muteNotifications, muteStories: mutes.muteStories })
                .from(mutes)
                .where(and(eq(mutes.muterId, ctx.user.id), eq(mutes.mutedId, input.userId)))
                .limit(1);
            return row[0] ? { muted: true, ...row[0] } : { muted: false };
        }),

    getMuted: protectedProcedure.query(async ({ ctx }) => {
        const { user } = await import('@/db/schema');
        const rows = await db
            .select({
                id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url,
                mutedAt: mutes.createdAt, muteNotifications: mutes.muteNotifications, muteStories: mutes.muteStories,
            })
            .from(mutes)
            .innerJoin(user, eq(mutes.mutedId, user.id))
            .where(eq(mutes.muterId, ctx.user.id));
        return rows;
    }),

    // ─── Hide Posts ──────────────────────────────────────────────────────────

    hidePost: protectedProcedure
        .input(z.object({ postId: z.string(), reason: z.enum(["not_interested", "seen_too_often", "offensive", "other"]).optional() }))
        .mutation(async ({ ctx, input }) => {
            await db.insert(hiddenPosts).values({ id: nanoid(), userId: ctx.user.id, postId: input.postId, reason: input.reason }).onConflictDoNothing();
            return { success: true };
        }),

    unhidePost: protectedProcedure
        .input(z.object({ postId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(hiddenPosts).where(and(eq(hiddenPosts.userId, ctx.user.id), eq(hiddenPosts.postId, input.postId)));
            return { success: true };
        }),

    isPostHidden: publicProcedure
        .input(z.object({ postId: z.string() }))
        .query(async ({ ctx, input }) => {
            if (!ctx.user) return { hidden: false };
            const row = await db.select({ id: hiddenPosts.id }).from(hiddenPosts).where(and(eq(hiddenPosts.userId, ctx.user.id), eq(hiddenPosts.postId, input.postId))).limit(1);
            return { hidden: row.length > 0 };
        }),

    getHiddenPosts: protectedProcedure.query(async ({ ctx }) => {
        const { user } = await import('@/db/schema');
        const { posts } = await import('@/db/schema/content');
        return db
            .select({ id: hiddenPosts.id, postId: hiddenPosts.postId, reason: hiddenPosts.reason, hiddenAt: hiddenPosts.createdAt, content: posts.content, authorId: user.id, authorName: user.name, authorUsername: user.username, authorAvatar: user.avatar_url })
            .from(hiddenPosts)
            .innerJoin(posts, eq(hiddenPosts.postId, posts.id))
            .innerJoin(user, eq(posts.userId, user.id))
            .where(eq(hiddenPosts.userId, ctx.user.id))
            .orderBy(desc(hiddenPosts.createdAt))
            .limit(200);
    }),

    clearAllHidden: protectedProcedure.mutation(async ({ ctx }) => {
        await db.delete(hiddenPosts).where(eq(hiddenPosts.userId, ctx.user.id));
        return { success: true };
    }),

    updateMuteSettings: protectedProcedure
        .input(z.object({
            userId: z.string(),
            muteNotifications: z.boolean().optional(),
            muteStories: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const update: Partial<typeof mutes.$inferInsert> = {};
            if (input.muteNotifications !== undefined) update.muteNotifications = input.muteNotifications;
            if (input.muteStories !== undefined) update.muteStories = input.muteStories;
            await db.update(mutes).set(update)
                .where(and(eq(mutes.muterId, ctx.user.id), eq(mutes.mutedId, input.userId)));
            return { success: true };
        }),

    // ─── Reports ─────────────────────────────────────────────────────────────

    submitReport: protectedProcedure
        .input(z.object({
            targetPostId: z.string().optional(),
            targetUserId: z.string().optional(),
            reason: z.enum(["spam", "harassment", "hate_speech", "misinformation", "nudity", "violence", "other"]),
            details: z.string().max(500).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            if (!input.targetPostId && !input.targetUserId) throw new Error("Must specify a target");
            await db.insert(reports).values({
                id: nanoid(),
                reporterId: ctx.user.id,
                targetPostId: input.targetPostId,
                targetUserId: input.targetUserId,
                reason: input.reason,
                details: input.details,
            }).onConflictDoNothing();
            return { success: true };
        }),

    getMyReports: protectedProcedure.query(async ({ ctx }) => {
        return db.select().from(reports)
            .where(eq(reports.reporterId, ctx.user.id))
            .orderBy(desc(reports.createdAt))
            .limit(50);
    }),

    // ─── Verification Requests ────────────────────────────────────────────────

    getMyVerificationRequest: protectedProcedure.query(async ({ ctx }) => {
        const row = await db.select().from(verificationRequests)
            .where(eq(verificationRequests.userId, ctx.user.id))
            .limit(1);
        return row[0] ?? null;
    }),

    submitVerificationRequest: protectedProcedure
        .input(z.object({
            requestedTier: z.enum(["verified", "business", "government"]),
            fullName: z.string().min(2).max(100),
            bio: z.string().max(500).optional(),
            website: z.string().url().optional(),
            twitterHandle: z.string().max(50).optional(),
            reason: z.string().min(20).max(1000),
        }))
        .mutation(async ({ ctx, input }) => {
            // Upsert — one request per user
            const existing = await db.select({ id: verificationRequests.id })
                .from(verificationRequests)
                .where(eq(verificationRequests.userId, ctx.user.id))
                .limit(1);
            if (existing[0]) {
                await db.update(verificationRequests).set({
                    ...input, status: "pending", reviewedAt: null, rejectionReason: null, updatedAt: new Date(),
                }).where(eq(verificationRequests.userId, ctx.user.id));
            } else {
                await db.insert(verificationRequests).values({ id: nanoid(), userId: ctx.user.id, ...input });
            }
            return { success: true };
        }),

    // ─── Creator Bans ─────────────────────────────────────────────────────────

    /**
     * This channel's moderation audit log (studio S2 panel 7).
     *
     * Own channel only — `creatorId` is pinned to the caller rather than taken
     * as input, so there is no shape of request that reads someone else's log.
     * Moderators acting here write rows owned by the CHANNEL, which is why one
     * equality answers "everything that happened in my chat".
     *
     * Two left joins because both people are ON DELETE SET NULL: a deleted
     * account keeps its line in the log and loses its name, and an inner join
     * would silently drop exactly the rows most worth keeping.
     */
    getModActions: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
        .query(async ({ ctx, input }) => {
            const actor = alias(user, "mod_actor");
            const target = alias(user, "mod_target");
            return db
                .select({
                    id: moderationActions.id,
                    action: moderationActions.action,
                    detail: moderationActions.detail,
                    createdAt: moderationActions.createdAt,
                    actor: { name: actor.name, username: actor.username, avatar_url: actor.avatar_url },
                    target: { name: target.name, username: target.username, avatar_url: target.avatar_url },
                })
                .from(moderationActions)
                .leftJoin(actor, eq(moderationActions.actorId, actor.id))
                .leftJoin(target, eq(moderationActions.targetUserId, target.id))
                .where(eq(moderationActions.creatorId, ctx.user.id))
                .orderBy(desc(moderationActions.createdAt))
                .limit(input?.limit ?? 20);
        }),

    banUser: protectedProcedure
        .input(z.object({ userId: z.string(), reason: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.id === input.userId) throw new Error("Cannot ban yourself");
            await db.insert(creatorBans).values({
                id: nanoid(),
                creatorId: ctx.user.id,
                bannedUserId: input.userId,
                reason: input.reason,
            }).onConflictDoNothing();
            await logModAction({ creatorId: ctx.user.id, actorId: ctx.user.id, targetUserId: input.userId, action: "ban", detail: input.reason });
            return { success: true };
        }),

    unbanUser: protectedProcedure
        .input(z.object({ userId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(creatorBans).where(
                and(eq(creatorBans.creatorId, ctx.user.id), eq(creatorBans.bannedUserId, input.userId))
            );
            await logModAction({ creatorId: ctx.user.id, actorId: ctx.user.id, targetUserId: input.userId, action: "unban" });
            return { success: true };
        }),

    isBanned: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(async ({ ctx, input }) => {
            if (!ctx.user) return { banned: false };
            const row = await db.select({ id: creatorBans.id }).from(creatorBans)
                .where(and(eq(creatorBans.creatorId, input.creatorId), eq(creatorBans.bannedUserId, ctx.user.id)))
                .limit(1);
            return { banned: row.length > 0 };
        }),

    isUserBannedByMe: protectedProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ ctx, input }) => {
            const row = await db.select({ id: creatorBans.id }).from(creatorBans)
                .where(and(eq(creatorBans.creatorId, ctx.user.id), eq(creatorBans.bannedUserId, input.userId)))
                .limit(1);
            return { banned: row.length > 0 };
        }),

    getBannedUsers: protectedProcedure.query(async ({ ctx }) => {
        const { user } = await import('@/db/schema');
        return db.select({
            id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url,
            reason: creatorBans.reason, bannedAt: creatorBans.createdAt,
        })
            .from(creatorBans)
            .innerJoin(user, eq(creatorBans.bannedUserId, user.id))
            .where(eq(creatorBans.creatorId, ctx.user.id))
            .orderBy(desc(creatorBans.createdAt));
    }),
});
