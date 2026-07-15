import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../trpc';
import { db } from '@/db';
import { user } from '@/db/schema';
import { follows } from '@/db/schema/content/follow';
import { posts } from '@/db/schema/content/post';
import { like, or, eq, count, and, desc, lt, gt, sql, inArray } from 'drizzle-orm';
import { withCache, invalidateCache, TTL } from '@/lib/cache';
import { createNotification } from '@/server/lib/notify';
import { awardXP } from '@/server/lib/xp';
import { recordQuestEvent } from '@/server/lib/quests';
import { upsertUser } from '@/lib/typesense/sync';

export const userRouter = router({
    // Live availability check for onboarding — same uniqueness source of
    // truth as /api/update-profile (which still re-validates on save).
    checkUsername: protectedProcedure
        .input(z.object({ username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/) }))
        .query(async ({ ctx, input }) => {
            const [existing] = await db
                .select({ id: user.id })
                .from(user)
                .where(eq(user.username, input.username))
                .limit(1);
            return { available: !existing || existing.id === ctx.user.id };
        }),

    /**
     * Search for users by name, username, or email
     */
    search: publicProcedure
        .input(
            z.object({
                query: z.string().default(""),
                limit: z.number().min(1).max(50).default(10),
            })
        )
        .query(async ({ input, ctx }) => {
            const cacheKey = `db:users:search:${input.query.toLowerCase()}:${input.limit}`;
            return withCache(cacheKey, TTL.USER_SEARCH, async () => {
                if (!input.query) {
                    const users = await db
                        .select({
                            id: user.id,
                            name: user.name,
                            username: user.username,
                            email: user.email,
                            avatar_url: user.avatar_url,
                            wallet_address: user.wallet_address,
                            verifiedTier: user.verifiedTier,
                        })
                        .from(user)
                        .limit(input.limit);
                    return { users };
                }

                const pattern = `%${input.query}%`;
                const users = await db
                    .select({
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        email: user.email,
                        avatar_url: user.avatar_url,
                        wallet_address: user.wallet_address,
                        verifiedTier: user.verifiedTier,
                        bio: user.bio,
                    })
                    .from(user)
                    .where(
                        or(
                            like(user.name, pattern),
                            like(user.username, pattern),
                            like(user.email, pattern)
                        )
                    )
                    .limit(input.limit);

                // Batch check follow status
                let followingSet = new Set<string>();
                if (ctx.user && users.length > 0) {
                    const myFollows = await db
                        .select({ followingId: follows.followingId })
                        .from(follows)
                        .where(and(
                            eq(follows.followerId, ctx.user.id),
                            inArray(follows.followingId, users.map(u => u.id))
                        ));
                    followingSet = new Set(myFollows.map(f => f.followingId));
                }

                return { 
                    users: users.map(u => ({
                        ...u,
                        isFollowing: followingSet.has(u.id)
                    }))
                };
            });
        }),

    /**
     * Set the current user's avatar to an arbitrary URL (e.g. an NFT image).
     */
    setAvatar: protectedProcedure
        .input(z.object({ avatar_url: z.string().url() }))
        .mutation(async ({ ctx, input }) => {
            await db
                .update(user)
                .set({ avatar_url: input.avatar_url })
                .where(eq(user.id, ctx.user.id));
            invalidateCache(`user:profile:${ctx.user.id}`);
            upsertUser({ id: ctx.user.id, name: ctx.user.name, username: ctx.user.username ?? "", avatar_url: input.avatar_url, createdAt: new Date() });
            return { success: true };
        }),

    /**
     * Check if the current user is following a given user
     */
    isFollowing: publicProcedure
        .input(z.object({ followingId: z.string() }))
        .query(async ({ ctx, input }) => {
            if (!ctx.user) return { isFollowing: false };
            const result = await db
                .select({ id: follows.id })
                .from(follows)
                .where(and(eq(follows.followerId, ctx.user.id), eq(follows.followingId, input.followingId)))
                .limit(1);
            return { isFollowing: result.length > 0 };
        }),

    /**
     * Follow a user
     */
    follow: protectedProcedure
        .input(z.object({ followingId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.id === input.followingId) throw new Error("Cannot follow yourself");
            await db.insert(follows).values({ followerId: ctx.user.id, followingId: input.followingId }).onConflictDoNothing();
            await createNotification({ userId: input.followingId, actorId: ctx.user.id, type: "follow" });
            await awardXP(input.followingId, "follow_received", ctx.user.id);
            await recordQuestEvent(input.followingId, "follow_received");
            return { success: true };
        }),

    /**
     * Unfollow a user
     */
    unfollow: protectedProcedure
        .input(z.object({ followingId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(follows).where(and(eq(follows.followerId, ctx.user.id), eq(follows.followingId, input.followingId)));
            return { success: true };
        }),

    /**
     * Get follower and following counts for a user
     */
    followCounts: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ input }) => {
            const [followerResult, followingResult] = await Promise.all([
                db.select({ count: count() }).from(follows).where(eq(follows.followingId, input.userId)),
                db.select({ count: count() }).from(follows).where(eq(follows.followerId, input.userId)),
            ]);
            return {
                followers: followerResult[0]?.count ?? 0,
                following: followingResult[0]?.count ?? 0,
            };
        }),

    /**
     * Get followers of a user (paginated)
     */
    getFollowers: publicProcedure
        .input(z.object({ userId: z.string(), cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20) }))
        .query(async ({ ctx, input }) => {
            const rows = await db
                .select({
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    bio: user.bio,
                    verifiedTier: user.verifiedTier,
                    followedAt: follows.createdAt,
                })
                .from(follows)
                .innerJoin(user, eq(follows.followerId, user.id))
                .where(
                    input.cursor
                        ? and(eq(follows.followingId, input.userId), lt(follows.createdAt, new Date(input.cursor)))
                        : eq(follows.followingId, input.userId)
                )
                .orderBy(desc(follows.createdAt))
                .limit(input.limit + 1);

            const hasMore = rows.length > input.limit;
            const items = hasMore ? rows.slice(0, input.limit) : rows;

            // Batch-check if current user is following each
            let followingSet = new Set<string>();
            if (ctx.user && items.length > 0) {
                const myFollows = await db
                    .select({ followingId: follows.followingId })
                    .from(follows)
                    .where(eq(follows.followerId, ctx.user.id));
                followingSet = new Set(myFollows.map(f => f.followingId));
            }

            return {
                items: items.map(r => ({ ...r, isFollowing: followingSet.has(r.id) })),
                hasMore,
                nextCursor: hasMore ? items[items.length - 1].followedAt.toISOString() : undefined,
            };
        }),

    /**
     * Get users that a user is following (paginated)
     */
    getFollowing: publicProcedure
        .input(z.object({ userId: z.string(), cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20) }))
        .query(async ({ ctx, input }) => {
            const rows = await db
                .select({
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    bio: user.bio,
                    verifiedTier: user.verifiedTier,
                    followedAt: follows.createdAt,
                })
                .from(follows)
                .innerJoin(user, eq(follows.followingId, user.id))
                .where(
                    input.cursor
                        ? and(eq(follows.followerId, input.userId), lt(follows.createdAt, new Date(input.cursor)))
                        : eq(follows.followerId, input.userId)
                )
                .orderBy(desc(follows.createdAt))
                .limit(input.limit + 1);

            const hasMore = rows.length > input.limit;
            const items = hasMore ? rows.slice(0, input.limit) : rows;

            let followingSet = new Set<string>();
            if (ctx.user && items.length > 0) {
                const myFollows = await db
                    .select({ followingId: follows.followingId })
                    .from(follows)
                    .where(eq(follows.followerId, ctx.user.id));
                followingSet = new Set(myFollows.map(f => f.followingId));
            }

            return {
                items: items.map(r => ({ ...r, isFollowing: followingSet.has(r.id) })),
                hasMore,
                nextCursor: hasMore ? items[items.length - 1].followedAt.toISOString() : undefined,
            };
        }),

    /**
     * Update online status + DM settings
     */
    updatePrivacySettings: protectedProcedure
        .input(z.object({
            showOnlineStatus: z.boolean().optional(),
            dmRequireFollow: z.boolean().optional(),
            dmPrice: z.number().int().min(0).nullable().optional(), // lamports; null = free
        }))
        .mutation(async ({ ctx, input }) => {
            const update: Record<string, unknown> = {};
            if (input.showOnlineStatus !== undefined) update.showOnlineStatus = input.showOnlineStatus;
            if (input.dmRequireFollow !== undefined) update.dmRequireFollow = input.dmRequireFollow;
            if (input.dmPrice !== undefined) update.dmPrice = input.dmPrice === 0 ? null : input.dmPrice;
            await db.update(user).set(update).where(eq(user.id, ctx.user.id));
            invalidateCache(`user:profile:${ctx.user.id}`);
            return { success: true };
        }),

    /**
     * Heartbeat — updates lastSeenAt for presence
     */
    heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
        await db.update(user).set({ lastSeenAt: new Date() }).where(eq(user.id, ctx.user.id));
        return { success: true };
    }),

    /**
     * Get online status for a user (respects showOnlineStatus)
     */
    getOnlineStatus: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ input }) => {
            const row = await db.select({ lastSeenAt: user.lastSeenAt, showOnlineStatus: user.showOnlineStatus })
                .from(user).where(eq(user.id, input.userId)).limit(1);
            if (!row[0] || !row[0].showOnlineStatus) return { isOnline: false, lastSeenAt: null };
            const isOnline = row[0].lastSeenAt ? (Date.now() - row[0].lastSeenAt.getTime()) < 5 * 60 * 1000 : false;
            return { isOnline, lastSeenAt: row[0].lastSeenAt };
        }),

    /**
     * Analytics: follower growth, top posts, engagement summary
     */
    getAnalytics: protectedProcedure.query(async ({ ctx }) => {
        const [followerCount, followingCount, postStats] = await Promise.all([
            db.select({ count: count() }).from(follows).where(eq(follows.followingId, ctx.user.id)),
            db.select({ count: count() }).from(follows).where(eq(follows.followerId, ctx.user.id)),
            db.select({
                totalPosts: count(),
                totalLikes: sql<number>`COALESCE(SUM(${posts.likes}), 0)`,
                totalReposts: sql<number>`COALESCE(SUM(${posts.reposts}), 0)`,
                totalComments: sql<number>`COALESCE(SUM(${posts.comments}), 0)`,
                totalViews: sql<number>`COALESCE(SUM(${posts.views}), 0)`,
            }).from(posts).where(and(eq(posts.userId, ctx.user.id), eq(posts.status, "published"))),
        ]);
        const topPosts = await db.select({
            id: posts.id, content: posts.content, imageUrl: posts.imageUrl,
            likes: posts.likes, reposts: posts.reposts, comments: posts.comments, views: posts.views, createdAt: posts.createdAt,
        }).from(posts)
            .where(and(eq(posts.userId, ctx.user.id), eq(posts.status, "published")))
            .orderBy(desc(posts.views))
            .limit(5);

        return {
            followers: followerCount[0]?.count ?? 0,
            following: followingCount[0]?.count ?? 0,
            ...postStats[0],
            topPosts,
        };
    }),

    getEngagementHistory: protectedProcedure.query(async ({ ctx }) => {
        // Last 30 days of follower gains, post views, and subscriber gains
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { subscriptions } = await import("@/db/schema/content");

        const [followerGains, postActivity, subscriberGains] = await Promise.all([
            db.select({
                day: sql<string>`DATE_TRUNC('day', ${follows.createdAt})::date::text`,
                count: count(),
            })
            .from(follows)
            .where(and(eq(follows.followingId, ctx.user.id), gt(follows.createdAt, thirtyDaysAgo)))
            .groupBy(sql`DATE_TRUNC('day', ${follows.createdAt})`)
            .orderBy(sql`DATE_TRUNC('day', ${follows.createdAt})`),

            db.select({
                day: sql<string>`DATE_TRUNC('day', ${posts.createdAt})::date::text`,
                views: sql<number>`COALESCE(SUM(${posts.views}), 0)`,
                likes: sql<number>`COALESCE(SUM(${posts.likes}), 0)`,
                postCount: count(),
            })
            .from(posts)
            .where(and(eq(posts.userId, ctx.user.id), gt(posts.createdAt, thirtyDaysAgo), eq(posts.status, "published")))
            .groupBy(sql`DATE_TRUNC('day', ${posts.createdAt})`)
            .orderBy(sql`DATE_TRUNC('day', ${posts.createdAt})`),

            db.select({
                day: sql<string>`DATE_TRUNC('day', ${subscriptions.createdAt})::date::text`,
                count: count(),
            })
            .from(subscriptions)
            .where(and(eq(subscriptions.creatorId, ctx.user.id), gt(subscriptions.createdAt, thirtyDaysAgo)))
            .groupBy(sql`DATE_TRUNC('day', ${subscriptions.createdAt})`)
            .orderBy(sql`DATE_TRUNC('day', ${subscriptions.createdAt})`),
        ]);

        return { followerGains, postActivity, subscriberGains };
    }),

    /**
     * Update the current user's profile information
     */
    updateProfile: protectedProcedure
        .input(
            z.object({
                name: z.string().min(1).max(50),
                bio: z.string().max(160).nullable().optional(),
                location: z.string().max(100).nullable().optional(),
                website: z.string().max(100).nullable().optional(),
                banner_url: z.string().url().nullable().optional(),
                avatar_url: z.string().url().nullable().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await db
                .update(user)
                .set({
                    name: input.name,
                    bio: input.bio,
                    location: input.location,
                    website: input.website,
                    banner_url: input.banner_url,
                    avatar_url: input.avatar_url,
                })
                .where(eq(user.id, ctx.user.id));
            
            invalidateCache(`user:profile:${ctx.user.id}`);
            upsertUser({ id: ctx.user.id, name: input.name, username: ctx.user.username ?? "", avatar_url: input.avatar_url, createdAt: new Date() });
            return { success: true };
        }),

    /**
     * Get a comprehensive user profile for the hover card or profile page
     */
    getProfile: publicProcedure
        .input(z.object({ 
            userId: z.string().optional(),
            username: z.string().optional()
        }))
        .query(async ({ input, ctx }) => {
            const { userId, username } = input;
            if (!userId && !username) throw new Error("userId or username is required");

            const targetUser = await db.query.user.findFirst({
                where: userId ? eq(user.id, userId) : eq(user.username, username!),
            });

            if (!targetUser) throw new Error("User not found");

            const [followerCount, followingCount, isFollowingResult, mutualFollowers] = await Promise.all([
                db.select({ count: count() }).from(follows).where(eq(follows.followingId, targetUser.id)),
                db.select({ count: count() }).from(follows).where(eq(follows.followerId, targetUser.id)),
                ctx.user ? db.select({ id: follows.id }).from(follows).where(and(eq(follows.followerId, ctx.user.id), eq(follows.followingId, targetUser.id))).limit(1) : Promise.resolve([]),
                ctx.user ? db.select({ 
                    id: user.id, 
                    name: user.name, 
                    avatar_url: user.avatar_url 
                })
                .from(follows)
                .innerJoin(user, eq(follows.followerId, user.id))
                .where(and(
                    eq(follows.followingId, targetUser.id),
                    sql`${follows.followerId} IN (SELECT ${follows.followingId} FROM ${follows} WHERE ${follows.followerId} = ${ctx.user.id})`
                ))
                .limit(3) : Promise.resolve([]),
            ]);

            return {
                id: targetUser.id,
                name: targetUser.name,
                username: targetUser.username,
                avatar_url: targetUser.avatar_url,
                banner_url: targetUser.banner_url,
                bio: targetUser.bio,
                verifiedTier: targetUser.verifiedTier,
                followersCount: followerCount[0]?.count ?? 0,
                followingCount: followingCount[0]?.count ?? 0,
                isFollowing: isFollowingResult.length > 0,
                mutualFollowers: mutualFollowers.map(f => ({
                    id: f.id,
                    name: f.name,
                    avatar_url: f.avatar_url
                })),
            };
        }),
});
