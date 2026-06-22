import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { posts, user, mutes, blocks, follows } from "@/db/schema";
import { eq, desc, and, lt, sql, inArray, or, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordSignal, ACTION } from "@/lib/feed-ranker/signals";

export const feedRouter = router({
    getFeed: publicProcedure
        .input(
            z.object({
                type: z.enum(["for-you", "following", "news"]).default("for-you"),
                cursor: z.string().optional(),
                limit: z.number().min(1).max(100).default(20),
            })
        )
        .query(async ({ ctx, input }) => {
            const origPosts = alias(posts, "orig_posts");
            const origUser = alias(user, "orig_user");
            const parentPosts = alias(posts, "parent_posts");
            const parentUser = alias(user, "parent_user");

            const selectFields = {
                id: posts.id,
                userId: posts.userId,
                content: posts.content,
                imageUrl: posts.imageUrl,
                visibility: posts.visibility,
                audience: posts.audience,
                replyPrivacy: posts.replyPrivacy,
                likes: posts.likes,
                reposts: posts.reposts,
                comments: posts.comments,
                bookmarks: sql<number>`(SELECT count(*) FROM bookmarks WHERE bookmarks."contentId" = ${posts.id} AND bookmarks."contentType" = 'post')`,
                views: posts.views,
                createdAt: posts.createdAt,
                baseScore: posts.baseScore,
                ticker: posts.ticker,
                token_image: posts.token_image,
                media: posts.media,
                tokenStatus: posts.tokenStatus,
                repostOfId: posts.repostOfId,
                isPaywalled: posts.isPaywalled,
                paywallPrice: posts.paywallPrice,
                hasContentWarning: posts.hasContentWarning,
                contentWarningText: posts.contentWarningText,
                linkPreview: posts.linkPreview,
                replyToId: posts.replyToId,
                isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND likes."userId" = ${ctx.user?.id ?? ""} AND likes."contentType" = 'post')`,
                isBookmarked: sql<boolean>`EXISTS (SELECT 1 FROM bookmarks WHERE bookmarks."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND bookmarks."userId" = ${ctx.user?.id ?? ""} AND bookmarks."contentType" = 'post')`,
                isReposted: sql<boolean>`EXISTS (SELECT 1 FROM posts rp WHERE rp."repostOfId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND rp."userId" = ${ctx.user?.id ?? ""} AND rp."status" = 'published')`,
                user: {
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    verifiedTier: user.verifiedTier,
                    affiliateUsername: user.affiliateUsername,
                    affiliateIconUrl: user.affiliateIconUrl,
                },
                videoUrl: posts.videoUrl,
                videoTitle: posts.title,
                videoThumbnailUrl: posts.thumbnailUrl,
                videoDuration: posts.duration,
                isLive: posts.isLive,
                origId: origPosts.id,
                origUserId: origPosts.userId,
                origContent: origPosts.content,
                origImageUrl: origPosts.imageUrl,
                origLikes: origPosts.likes,
                origReposts: origPosts.reposts,
                origComments: origPosts.comments,
                origViews: origPosts.views,
                origCreatedAt: origPosts.createdAt,
                origTicker: origPosts.ticker,
                origTokenStatus: origPosts.tokenStatus,
                origIsPaywalled: origPosts.isPaywalled,
                origPaywallPrice: origPosts.paywallPrice,
                origHasContentWarning: origPosts.hasContentWarning,
                origContentWarningText: origPosts.contentWarningText,
                origLinkPreview: origPosts.linkPreview,
                origUserName: origUser.name,
                origUserUsername: origUser.username,
                origUserAvatarUrl: origUser.avatar_url,
                origUserVerifiedTier: origUser.verifiedTier,
                origUserAffiliateUsername: origUser.affiliateUsername,
                origUserAffiliateIconUrl: origUser.affiliateIconUrl,
                origVideoUrl: origPosts.videoUrl,
                origVideoTitle: origPosts.title,
                origVideoThumbnailUrl: origPosts.thumbnailUrl,
                origVideoDuration: origPosts.duration,
                origVideoIsLive: origPosts.isLive,
                origMedia: origPosts.media,
                origTokenImage: origPosts.token_image,
                origAudience: origPosts.audience,
                origReplyPrivacy: origPosts.replyPrivacy,
                parentUsername: parentUser.username,
                parentUserId: parentUser.id,
                parentContent: parentPosts.content,
                parentMedia: parentPosts.media,
                parentImageUrl: parentPosts.imageUrl,
                parentCreatedAt: parentPosts.createdAt,
                parentUserAvatar: parentUser.avatar_url,
                parentUserName: parentUser.name,
                parentUserVerifiedTier: parentUser.verifiedTier,
            };

            const baseJoins = (qb: any) =>
                qb
                    .innerJoin(user, eq(posts.userId, user.id))
                    .leftJoin(origPosts, eq(posts.repostOfId, origPosts.id))
                    .leftJoin(origUser, eq(origPosts.userId, origUser.id))
                    .leftJoin(parentPosts, eq(posts.replyToId, parentPosts.id))
                    .leftJoin(parentUser, eq(parentPosts.userId, parentUser.id));

            let postsResults: any[] = [];
            let nextCursor: string | undefined = undefined;

            if (input.type === "for-you") {
                const cursorDate = input.cursor ? new Date(input.cursor) : undefined;
                let mutedIds = new Set<string>();
                let blockedIds = new Set<string>();
                
                if (ctx.user) {
                    const [mutedRows, blockedRows] = await Promise.all([
                        db.select({ mutedId: mutes.mutedId }).from(mutes).where(eq(mutes.muterId, ctx.user.id)),
                        db.select({ blockedId: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, ctx.user.id)),
                    ]);
                    mutedIds = new Set(mutedRows.map(r => r.mutedId));
                    blockedIds = new Set(blockedRows.map(r => r.blockedId));
                }

                const results = await baseJoins(
                    db.select(selectFields).from(posts)
                ).where(and(
                    eq(posts.status, "published"),
                    eq(posts.visibility, "public"),
                    cursorDate ? lt(posts.createdAt, cursorDate) : undefined,
                )).orderBy(desc(posts.createdAt))
                    .limit(input.limit + 5);

                const filtered = results.filter((p: any) => !mutedIds.has(p.userId) && !blockedIds.has(p.userId));

                if (filtered.length > input.limit) {
                    const nextItem = filtered[input.limit];
                    nextCursor = nextItem?.createdAt.toISOString();
                }
                postsResults = filtered.slice(0, input.limit);
            } else if (input.type === "following") {
                if (!ctx.user) return { posts: [], nextCursor: undefined };

                const followedRows = await db.select({ followingId: follows.followingId })
                    .from(follows)
                    .where(eq(follows.followerId, ctx.user.id));
                
                const followedIds = followedRows.map(r => r.followingId);
                if (followedIds.length === 0) return { posts: [], nextCursor: undefined };

                const cursorDate = input.cursor ? new Date(input.cursor) : undefined;
                const results = await baseJoins(
                    db.select(selectFields).from(posts)
                ).where(and(
                    eq(posts.status, "published"),
                    inArray(posts.userId, followedIds),
                    cursorDate ? lt(posts.createdAt, cursorDate) : undefined,
                )).orderBy(desc(posts.createdAt))
                    .limit(input.limit + 1);

                if (results.length > input.limit) {
                    const nextItem = results[input.limit];
                    nextCursor = nextItem?.createdAt.toISOString();
                }
                postsResults = results.slice(0, input.limit);
            }

            const mappedPosts = postsResults.map(row => {
                const { 
                    origId, origUserId, origContent, origImageUrl, origLikes, origReposts, 
                    origComments, origViews, origCreatedAt, origTicker, origTokenStatus, 
                    origIsPaywalled, origPaywallPrice, origHasContentWarning, origContentWarningText, 
                    origLinkPreview, origUserName, origUserUsername, origUserAvatarUrl, 
                    origUserVerifiedTier, origVideoUrl, origVideoTitle, origVideoThumbnailUrl, 
                    origVideoDuration, origVideoIsLive, origMedia, origTokenImage, 
                    origAudience, origReplyPrivacy, 
                    parentUsername, parentUserId, parentContent, parentMedia, parentImageUrl, 
                    parentCreatedAt, parentUserAvatar, parentUserName, parentUserVerifiedTier,
                    ...rest 
                } = row;

                if (row.repostOfId && row.origId) {
                    const isQuote = (row.content && row.content.trim().length > 0) || (row.media && row.media.length > 0) || row.imageUrl;
                    if (isQuote) {
                        return {
                            ...rest,
                            feedKey: null,
                            repostedBy: null,
                            quotedPost: {
                                id: row.origId,
                                userId: row.origUserId,
                                content: row.origContent,
                                imageUrl: row.origImageUrl,
                                media: row.origMedia,
                                videoUrl: row.origVideoUrl,
                                createdAt: row.origCreatedAt,
                                ticker: row.origTicker,
                                audience: row.origAudience,
                                replyPrivacy: row.origReplyPrivacy,
                                user: {
                                    name: row.origUserName,
                                    username: row.origUserUsername,
                                    avatar_url: row.origUserAvatarUrl,
                                    verifiedTier: row.origUserVerifiedTier,
                                    affiliateUsername: row.origUserAffiliateUsername,
                                    affiliateIconUrl: row.origUserAffiliateIconUrl,
                                },
                                hasContentWarning: row.origHasContentWarning,
                                contentWarningText: row.origContentWarningText,
                            },
                        };
                    }

                    return {
                        id: row.origId,
                        feedKey: row.id,
                        userId: row.origUserId!,
                        content: row.origContent,
                        imageUrl: row.origImageUrl || null,
                        media: row.origMedia || [],
                        token_image: row.origTokenImage || null,
                        videoUrl: row.origVideoUrl ?? null,
                        visibility: row.visibility,
                        audience: row.origAudience,
                        replyPrivacy: row.origReplyPrivacy,
                        likes: row.origLikes ?? 0,
                        reposts: row.origReposts ?? 0,
                        comments: row.origComments ?? 0,
                        views: row.origViews ?? 0,
                        createdAt: row.createdAt,
                        originalCreatedAt: row.origCreatedAt,
                        ticker: row.origTicker ?? null,
                        tokenStatus: row.origTokenStatus ?? null,
                        repostOfId: null,
                        isPaywalled: row.origIsPaywalled ?? false,
                        paywallPrice: row.origPaywallPrice ?? null,
                        hasContentWarning: row.origHasContentWarning ?? false,
                        contentWarningText: row.origContentWarningText ?? null,
                        linkPreview: row.origLinkPreview ?? null,
                        isLiked: row.isLiked ?? false,
                        isBookmarked: row.isBookmarked ?? false,
                        isReposted: row.isReposted ?? false,
                        user: {
                            id: row.origUserId!,
                            name: row.origUserName!,
                            username: row.origUserUsername ?? null,
                            avatar_url: row.origUserAvatarUrl ?? null,
                            verifiedTier: row.origUserVerifiedTier ?? null,
                            affiliateUsername: row.origUserAffiliateUsername ?? null,
                            affiliateIconUrl: row.origUserAffiliateIconUrl ?? null,
                        },
                        repostedBy: { name: row.user.name, username: row.user.username ?? null },
                        parentUsername,
                        parentUserId,
                        parentContent,
                        parentMedia,
                        parentImageUrl,
                        parentCreatedAt,
                        parentUserAvatar,
                        parentUserName,
                        parentUserVerifiedTier,
                    };
                }
                return { 
                    ...rest, 
                    feedKey: null, 
                    repostedBy: null,
                    parentUsername,
                    parentUserId,
                    parentContent,
                    parentMedia,
                    parentImageUrl,
                    parentCreatedAt,
                    parentUserAvatar,
                    parentUserName,
                    parentUserVerifiedTier,
                };
            });

            return { posts: mappedPosts, nextCursor };
        }),

    getVideoFeed: publicProcedure
        .input(z.object({ 
            cursor: z.string().optional(), 
            limit: z.number().min(1).max(50).default(20),
            category: z.string().optional()
        }))
        .query(async ({ ctx, input }) => {
            const cursorDate = input.cursor ? new Date(input.cursor) : undefined;
            const origPosts = alias(posts, "orig_posts");
            const origUser = alias(user, "orig_user");

            const results = await db
                .select({
                    id: posts.id,
                    userId: posts.userId,
                    content: posts.content,
                    videoUrl: posts.videoUrl,
                    thumbnailUrl: posts.thumbnailUrl,
                    title: posts.title,
                    duration: posts.duration,
                    category: posts.category,
                    isLive: posts.isLive,
                    // The signed-in user's saved playback position for this video
                    // (0 when none). Keyed by the resolved video id so reposts
                    // reflect progress on the original. Powers the card scrubber.
                    watchedTime: sql<number>`COALESCE((SELECT vp."currentTime" FROM video_progress vp WHERE vp."postId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND vp."userId" = ${ctx.user?.id ?? ""}), 0)`,
                    likes: posts.likes,
                    reposts: posts.reposts,
                    comments: posts.comments,
                    views: posts.views,
                    createdAt: posts.createdAt,
                    ticker: posts.ticker,
                    tokenStatus: posts.tokenStatus,
                    token_image: posts.token_image,
                    repostOfId: posts.repostOfId,
                    isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND likes."userId" = ${ctx.user?.id ?? ""} AND likes."contentType" = 'post')`,
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        verifiedTier: user.verifiedTier,
                        affiliateUsername: user.affiliateUsername,
                        affiliateIconUrl: user.affiliateIconUrl,
                    },
                    origId: origPosts.id,
                    origVideoUrl: origPosts.videoUrl,
                    origThumbnailUrl: origPosts.thumbnailUrl,
                    origTitle: origPosts.title,
                    origDuration: origPosts.duration,
                    origCategory: origPosts.category,
                    origIsLive: origPosts.isLive,
                    origContent: origPosts.content,
                    origUser: {
                        id: origUser.id,
                        name: origUser.name,
                        username: origUser.username,
                        avatar_url: origUser.avatar_url,
                        verifiedTier: origUser.verifiedTier,
                    }
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .leftJoin(origPosts, eq(posts.repostOfId, origPosts.id))
                .leftJoin(origUser, eq(origPosts.userId, origUser.id))
                .where(and(
                    eq(posts.status, "published"),
                    or(isNotNull(posts.videoUrl), isNotNull(origPosts.videoUrl)),
                    cursorDate ? lt(posts.createdAt, cursorDate) : undefined,
                    input.category ? eq(posts.category, input.category) : undefined,
                ))
                .orderBy(desc(posts.createdAt))
                .limit(input.limit + 1);

            const hasMore = results.length > input.limit;
            const rawItems = hasMore ? results.slice(0, input.limit) : results;
            
            const videos = rawItems.map(s => {
                if (s.repostOfId && s.origId) {
                    return {
                        ...s,
                        id: s.origId,
                        feedKey: s.id,
                        videoUrl: s.origVideoUrl!,
                        thumbnailUrl: s.origThumbnailUrl,
                        title: s.origTitle ?? "",
                        description: s.origContent,
                        // Reflect the original video's metadata, not the repost's.
                        duration: s.origDuration ?? 0,
                        category: s.origCategory,
                        isLive: s.origIsLive ?? false,
                        user: s.origUser!,
                        repostedBy: { name: s.user.name, username: s.user.username },
                    };
                }
                return { 
                    ...s, 
                    videoUrl: s.videoUrl!,
                    title: s.title ?? "",
                    description: s.content,
                    feedKey: null, 
                    repostedBy: null 
                };
            });

            return {
                videos,
                nextCursor: hasMore ? rawItems[rawItems.length - 1].createdAt.toISOString() : undefined,
            };
        }),

    getShortsFeed: publicProcedure
        .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20) }))
        .query(async ({ ctx, input }) => {
            const cursorDate = input.cursor ? new Date(input.cursor) : undefined;
            const origPosts = alias(posts, "orig_posts");
            const origUser = alias(user, "orig_user");
            const parentPosts = alias(posts, "parent_posts");
            const parentUser = alias(user, "parent_user");

            const results = await db
                .select({
                    id: posts.id,
                    userId: posts.userId,
                    content: posts.content,
                    videoUrl: posts.videoUrl,
                    thumbnailUrl: posts.thumbnailUrl,
                    title: posts.title,
                    duration: posts.duration,
                    likes: posts.likes,
                    reposts: posts.reposts,
                    comments: posts.comments,
                    views: posts.views,
                    createdAt: posts.createdAt,
                    ticker: posts.ticker,
                    tokenStatus: posts.tokenStatus,
                    token_image: posts.token_image,
                    repostOfId: posts.repostOfId,
                    isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND likes."userId" = ${ctx.user?.id ?? ""} AND likes."contentType" = 'post')`,
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        verifiedTier: user.verifiedTier,
                        affiliateUsername: user.affiliateUsername,
                        affiliateIconUrl: user.affiliateIconUrl,
                    },
                    origId: origPosts.id,
                    origVideoUrl: origPosts.videoUrl,
                    origThumbnailUrl: origPosts.thumbnailUrl,
                    origTitle: origPosts.title,
                    origContent: origPosts.content,
                    origUser: {
                        id: origUser.id,
                        name: origUser.name,
                        username: origUser.username,
                        avatar_url: origUser.avatar_url,
                        verifiedTier: origUser.verifiedTier,
                    },
                    parentUsername: parentUser.username,
                    parentUserId: parentUser.id,
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .leftJoin(origPosts, eq(posts.repostOfId, origPosts.id))
                .leftJoin(origUser, eq(origPosts.userId, origUser.id))
                .leftJoin(parentPosts, eq(posts.replyToId, parentPosts.id))
                .leftJoin(parentUser, eq(parentPosts.userId, parentUser.id))
                .where(and(
                    eq(posts.status, "published"),
                    or(isNotNull(posts.videoUrl), isNotNull(origPosts.videoUrl)),
                    cursorDate ? lt(posts.createdAt, cursorDate) : undefined,
                ))
                .orderBy(desc(posts.createdAt))
                .limit(input.limit + 1);

            const hasMore = results.length > input.limit;
            const rawItems = hasMore ? results.slice(0, input.limit) : results;
            
            const shorts = rawItems.map(s => {
                if (s.repostOfId && s.origId) {
                    return {
                        ...s,
                        id: s.origId,
                        feedKey: s.id,
                        videoUrl: s.origVideoUrl!,
                        thumbnailUrl: s.origThumbnailUrl,
                        title: s.origTitle ?? "",
                        description: s.origContent,
                        user: s.origUser!,
                        repostedBy: { name: s.user.name, username: s.user.username },
                        parentUsername: null,
                        parentUserId: null,
                    };
                }
                return { 
                    ...s, 
                    videoUrl: s.videoUrl!,
                    title: s.title ?? "",
                    description: s.content,
                    feedKey: null, 
                    repostedBy: null,
                    parentUsername: s.parentUsername,
                    parentUserId: s.parentUserId
                };
            });

            return {
                shorts,
                nextCursor: hasMore ? rawItems[rawItems.length - 1].createdAt.toISOString() : undefined,
            };
        }),

    // ── Phoenix ranker signals ────────────────────────────────────────────
    // "Not interested" / report — strong negative signal that downranks this
    // author/content for the user in the ranker (and feeds training labels).
    notInterested: protectedProcedure
        .input(z.object({
            subjectId: z.string(),
            subjectType: z.enum(["post", "stream"]).default("post"),
            authorId: z.string().optional(),
            surface: z.string().default("home"),
        }))
        .mutation(async ({ ctx, input }) => {
            await recordSignal({
                userId: ctx.user.id,
                subjectId: input.subjectId,
                subjectType: input.subjectType,
                authorId: input.authorId ?? null,
                actionType: ACTION.NEGATIVE,
                surface: input.surface,
                // one negative mark per (user, content) is enough
                dedupeKey: `neg_${ctx.user.id}_${input.subjectId}`,
            });
            return { success: true };
        }),

    // Dwell — accumulated visible time on a feed card, sent by the client
    // (IntersectionObserver). Batched: the client posts one row per card per
    // session-ish window. value = seconds visible.
    recordDwell: protectedProcedure
        .input(z.object({
            items: z.array(z.object({
                subjectId: z.string(),
                subjectType: z.enum(["post", "stream"]).default("post"),
                authorId: z.string().optional(),
                seconds: z.number().min(0).max(3600),
                surface: z.string().default("home"),
            })).max(50),
        }))
        .mutation(async ({ ctx, input }) => {
            await Promise.all(input.items
                .filter((it) => it.seconds >= 1) // ignore fly-by scrolls
                .map((it) => recordSignal({
                    userId: ctx.user.id,
                    subjectId: it.subjectId,
                    subjectType: it.subjectType,
                    authorId: it.authorId ?? null,
                    actionType: ACTION.DWELL,
                    value: it.seconds,
                    surface: it.surface,
                })));
            return { success: true };
        }),
});
