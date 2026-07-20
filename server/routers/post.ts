import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { posts, user, bookmarks } from "@/db/schema";
import { eq, and, desc, lt, sql, ilike, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { effectiveVerifiedTier } from "@/lib/verified-tier";

export const postRouter = router({
    getPost: publicProcedure
        .input(z.object({ postId: z.string() }))
        .query(async ({ ctx, input }) => {
            const origPosts = alias(posts, "orig_posts");
            const origUser = alias(user, "orig_user");
            const parentPosts = alias(posts, "parent_posts");
            const parentUser = alias(user, "parent_user");
            const result = await db
                .select({
                    id: posts.id,
                    userId: posts.userId,
                    content: posts.content,
                    imageUrl: posts.imageUrl,
                    visibility: posts.visibility,
                    likes: posts.likes,
                    reposts: posts.reposts,
                    comments: posts.comments,
                    createdAt: posts.createdAt,
                    ticker: posts.ticker,
                    tokenStatus: posts.tokenStatus,
                    isPaywalled: posts.isPaywalled,
                    paywallPrice: posts.paywallPrice,
                    linkPreview: posts.linkPreview,
                    repostOfId: posts.repostOfId,
                    token_image: posts.token_image,
                    media: posts.media,
                    videoUrl: posts.videoUrl,
                    isPinned: posts.isPinned,
                    views: posts.views,
                    bookmarks: sql<number>`(SELECT count(*) FROM bookmarks WHERE bookmarks."contentId" = ${posts.id} AND bookmarks."contentType" = 'post')`,
                    quoteCount: sql<number>`(SELECT count(*) FROM posts q WHERE q."repostOfId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND (q."content" IS NOT NULL OR q."media" IS NOT NULL OR q."imageUrl" IS NOT NULL))`,
                    audience: posts.audience,
                    replyPrivacy: posts.replyPrivacy,
                    hasContentWarning: posts.hasContentWarning,
                    contentWarningText: posts.contentWarningText,
                    replyToId: posts.replyToId,
                    parentContent: parentPosts.content,
                    parentImageUrl: parentPosts.imageUrl,
                    parentMedia: parentPosts.media,
                    parentCreatedAt: parentPosts.createdAt,
                    parentUsername: parentUser.username,
                    parentUserId: parentUser.id,
                    parentUserAvatar: parentUser.avatar_url,
                    parentUserName: parentUser.name,
                    parentUserVerifiedTier: effectiveVerifiedTier(parentUser.verifiedTier, parentUser.hideVerifiedBadge),
                    origId: origPosts.id,
                    origUserId: origPosts.userId,
                    origContent: origPosts.content,
                    origImageUrl: origPosts.imageUrl,
                    origAudience: origPosts.audience,
                    origReplyPrivacy: origPosts.replyPrivacy,
                    origMedia: origPosts.media,
                    origLikes: origPosts.likes,
                    origReposts: origPosts.reposts,
                    origComments: origPosts.comments,
                    origCreatedAt: origPosts.createdAt,
                    origTicker: origPosts.ticker,
                    origTokenImage: origPosts.token_image,
                    origVideoUrl: origPosts.videoUrl,
                    origLinkPreview: origPosts.linkPreview,
                    origUserName: origUser.name,
                    origUserUsername: origUser.username,
                    origUserAvatar: origUser.avatar_url,
                    origUserVerifiedTier: effectiveVerifiedTier(origUser.verifiedTier, origUser.hideVerifiedBadge),
                    isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND likes."userId" = ${ctx.user?.id ?? ""} AND likes."contentType" = 'post')`,
                    isBookmarked: sql<boolean>`EXISTS (SELECT 1 FROM bookmarks WHERE bookmarks."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND bookmarks."userId" = ${ctx.user?.id ?? ""} AND bookmarks."contentType" = 'post')`,
                    isReposted: sql<boolean>`EXISTS (SELECT 1 FROM posts rp WHERE rp."repostOfId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND rp."userId" = ${ctx.user?.id ?? ""} AND rp."status" = 'published')`,
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
                    },
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .leftJoin(origPosts, eq(posts.repostOfId, origPosts.id))
                .leftJoin(origUser, eq(origPosts.userId, origUser.id))
                .leftJoin(parentPosts, eq(sql`COALESCE(${posts.replyToId}, ${origPosts.replyToId})`, parentPosts.id))
                .leftJoin(parentUser, eq(parentPosts.userId, parentUser.id))
                .where(eq(posts.id, input.postId))
                .limit(1);
            
            const row = result[0];
            if (!row) return null;

            if (row.repostOfId && row.origId) {
                const isQuote = (row.content && row.content.trim().length > 0) || (row.media && row.media.length > 0) || row.imageUrl;
                
                if (isQuote) {
                    return {
                        ...row,
                        quoteCount: row.quoteCount,
                        feedKey: null,
                        repostedBy: null,
                        quotedPost: {
                            id: row.origId,
                            userId: row.origUserId,
                            content: row.origContent,
                            imageUrl: row.origImageUrl,
                            media: row.origMedia,
                            createdAt: row.origCreatedAt,
                            ticker: row.origTicker,
                            audience: row.origAudience,
                            replyPrivacy: row.origReplyPrivacy,
                            user: {
                                id: row.origUserId!,
                                name: row.origUserName,
                                username: row.origUserUsername,
                                avatar_url: row.origUserAvatar,
                                verifiedTier: (row as any).origUserVerifiedTier ?? null,
                            }
                        }
                    };
                }

                return {
                    id: row.origId,
                    feedKey: row.id,
                    userId: row.origUserId!,
                    content: row.origContent,
                    imageUrl: row.origImageUrl || null,
                    token_image: row.origTokenImage || null,
                    media: row.origMedia || [],
                    videoUrl: (row as any).origVideoUrl || null,
                    isPinned: false,
                    likes: row.origLikes ?? 0,
                    reposts: row.origReposts ?? 0,
                    comments: row.origComments ?? 0,
                    bookmarks: row.bookmarks,
                    quoteCount: row.quoteCount,
                    views: row.views ?? 0,
                    createdAt: row.createdAt,
                    originalCreatedAt: row.origCreatedAt,
                    ticker: row.origTicker ?? null,
                    audience: row.origAudience,
                    replyPrivacy: row.origReplyPrivacy,
                    repostOfId: null,
                    isPaywalled: row.isPaywalled,
                    isLiked: row.isLiked,
                    isBookmarked: row.isBookmarked,
                    isReposted: row.isReposted,
                    linkPreview: row.origLinkPreview || null,
                    user: {
                        id: row.origUserId!,
                        name: row.origUserName!,
                        username: row.origUserUsername ?? null,
                        avatar_url: row.origUserAvatar ?? null,
                        verifiedTier: (row as any).origUserVerifiedTier ?? null,
                    },
                    repostedBy: { name: row.user.name, username: row.user.username },
                    quotedPost: null,
                    replyToId: row.replyToId,
                    parentContent: row.parentContent,
                    parentImageUrl: row.parentImageUrl,
                    parentMedia: row.parentMedia,
                    parentCreatedAt: row.parentCreatedAt,
                    parentUsername: row.parentUsername,
                    parentUserId: row.parentUserId,
                    parentUserAvatar: row.parentUserAvatar,
                    parentUserName: row.parentUserName,
                    parentUserVerifiedTier: row.parentUserVerifiedTier,
                };
            }

            return { ...row, quoteCount: row.quoteCount, feedKey: null, repostedBy: null, quotedPost: null };
        }),

    searchPosts: publicProcedure
        .input(
            z.object({
                query: z.string(),
                limit: z.number().min(1).max(50).default(20),
                cursor: z.string().optional(),
                sort: z.enum(["latest", "top"]).default("latest"),
                onlyMedia: z.boolean().default(false),
            })
        )
        .query(async ({ ctx, input }) => {
            const pattern = `%${input.query}%`;
            const cursorValue = input.cursor;

            const origPosts = alias(posts, "orig_posts");
            const origUser = alias(user, "orig_user");
            const parentPosts = alias(posts, "parent_posts");
            const parentUser = alias(user, "parent_user");

            const rows = await db
                .select({
                    id: posts.id,
                    userId: posts.userId,
                    content: posts.content,
                    imageUrl: posts.imageUrl,
                    visibility: posts.visibility,
                    likes: posts.likes,
                    reposts: posts.reposts,
                    comments: posts.comments,
                    createdAt: posts.createdAt,
                    ticker: posts.ticker,
                    tokenStatus: posts.tokenStatus,
                    isPaywalled: posts.isPaywalled,
                    paywallPrice: posts.paywallPrice,
                    token_image: posts.token_image,
                    repostOfId: posts.repostOfId,
                    views: posts.views,
                    bookmarks: sql<number>`(SELECT count(*) FROM bookmarks WHERE bookmarks."contentId" = ${posts.id} AND bookmarks."contentType" = 'post')`,
                    media: posts.media,
                    videoUrl: posts.videoUrl,
                    isPinned: posts.isPinned,
                    audience: posts.audience,
                    replyPrivacy: posts.replyPrivacy,
                    hasContentWarning: posts.hasContentWarning,
                    contentWarningText: posts.contentWarningText,
                    baseScore: posts.baseScore,
                    origId: origPosts.id,
                    origUserId: origPosts.userId,
                    origContent: origPosts.content,
                    origImageUrl: origPosts.imageUrl,
                    origAudience: origPosts.audience,
                    origReplyPrivacy: origPosts.replyPrivacy,
                    origMedia: origPosts.media,
                    origLikes: origPosts.likes,
                    origReposts: origPosts.reposts,
                    origComments: origPosts.comments,
                    origCreatedAt: origPosts.createdAt,
                    origTicker: origPosts.ticker,
                    origTokenImage: origPosts.token_image,
                    origLinkPreview: origPosts.linkPreview,
                    origUserName: origUser.name,
                    origUserUsername: origUser.username,
                    origUserAvatar: origUser.avatar_url,
                    isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND likes."userId" = ${ctx.user?.id ?? ""} AND likes."contentType" = 'post')`,
                    isBookmarked: sql<boolean>`EXISTS (SELECT 1 FROM bookmarks WHERE bookmarks."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND bookmarks."userId" = ${ctx.user?.id ?? ""} AND bookmarks."contentType" = 'post')`,
                    isReposted: sql<boolean>`EXISTS (SELECT 1 FROM posts rp WHERE rp."repostOfId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND rp."userId" = ${ctx.user?.id ?? ""} AND rp."status" = 'published')`,
                    user: { id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url, verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge) },
                    origUserVerifiedTier: effectiveVerifiedTier(origUser.verifiedTier, origUser.hideVerifiedBadge),
                    origVideoUrl: origPosts.videoUrl,
                    origHasContentWarning: origPosts.hasContentWarning,
                    origContentWarningText: origPosts.contentWarningText,
                    origIsPinned: origPosts.isPinned,
                    title: posts.title,
                    origTitle: origPosts.title,
                    parentUsername: parentUser.username,
                    parentUserId: parentUser.id,
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .leftJoin(origPosts, eq(posts.repostOfId, origPosts.id))
                .leftJoin(origUser, eq(origPosts.userId, origUser.id))
                .leftJoin(parentPosts, eq(sql`COALESCE(${posts.replyToId}, ${origPosts.replyToId})`, parentPosts.id))
                .leftJoin(parentUser, eq(parentPosts.userId, parentUser.id))
                .where(and(
                    eq(posts.status, "published"),
                    // Match the query against the body OR the title — videos are
                    // titled with empty content, so a content-only filter never
                    // surfaced them (Videos/Media tabs came up empty).
                    or(ilike(posts.content, pattern), ilike(posts.title, pattern)),
                    input.onlyMedia ? or(sql`${posts.media} IS NOT NULL AND jsonb_array_length(${posts.media}) > 0`, sql`${posts.imageUrl} IS NOT NULL`, sql`${posts.videoUrl} IS NOT NULL`) : undefined,
                    cursorValue ? lt(input.sort === "top" ? posts.baseScore : posts.createdAt, cursorValue as any) : undefined,
                ))
                .orderBy(input.sort === "top" ? desc(posts.baseScore) : desc(posts.createdAt))
                .limit(input.limit + 1);

            const hasMore = rows.length > input.limit;
            const rawItems = hasMore ? rows.slice(0, input.limit) : rows;
            const items = rawItems.map(row => {
                if (row.repostOfId && row.origId) {
                    const isQuote = (row.content && row.content.trim().length > 0) || (row.media && row.media.length > 0) || row.imageUrl;
                    
                    if (isQuote) {
                        return {
                            ...row,
                            feedKey: null,
                            repostedBy: null,
                            quotedPost: {
                                id: row.origId,
                                userId: row.origUserId,
                                content: row.origContent,
                                imageUrl: row.origImageUrl,
                                media: row.origMedia,
                                createdAt: row.origCreatedAt,
                                ticker: row.origTicker,
                                audience: row.origAudience,
                                replyPrivacy: row.origReplyPrivacy,
                                user: {
                                    name: row.origUserName,
                                    username: row.origUserUsername,
                                    avatar_url: row.origUserAvatar,
                                }
                            }
                        };
                    }

                    return {
                        id: row.origId,
                        feedKey: row.id,
                        userId: row.origUserId ?? row.userId,
                        content: row.origContent,
                        title: row.origTitle || null,
                        videoUrl: row.origVideoUrl || null,
                        imageUrl: row.origImageUrl || null,
                        token_image: row.origTokenImage || null,
                        media: row.origMedia || [],
                        likes: row.origLikes ?? 0,
                        reposts: row.origReposts ?? 0,
                        comments: row.origComments ?? 0,
                        views: row.views ?? 0,
                        createdAt: row.createdAt,
                        originalCreatedAt: row.origCreatedAt,
                        ticker: row.origTicker ?? null,
                        tokenStatus: row.tokenStatus,
                        audience: row.origAudience,
                        replyPrivacy: row.origReplyPrivacy,
                        repostOfId: null,
                        isPaywalled: row.isPaywalled,
                        isLiked: row.isLiked,
                        isBookmarked: row.isBookmarked,
                        isReposted: row.isReposted,
                        linkPreview: row.origLinkPreview || null,
                        user: {
                            id: row.origUserId ?? row.userId,
                            name: row.origUserName ?? row.user.name,
                            username: row.origUserUsername ?? row.user.username,
                            avatar_url: row.origUserAvatar ?? row.user.avatar_url,
                            verifiedTier: row.origUserVerifiedTier ?? row.user.verifiedTier,
                        },
                        repostedBy: { name: row.user.name, username: row.user.username },
                        parentUsername: null,
                        parentUserId: null,
                    };
                }
                return { ...row, feedKey: null, repostedBy: null };
            });
            let nextCursor: string | undefined;
            if (hasMore) {
                const lastItem = rawItems[rawItems.length - 1];
                nextCursor = input.sort === "top" ? lastItem.baseScore?.toString() : lastItem.createdAt.toISOString();
            }

            return { posts: items, hasMore, nextCursor };
        }),

    getBookmarks: protectedProcedure
        .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20) }))
        .query(async ({ ctx, input }) => {
            const cursorDate = input.cursor ? new Date(input.cursor) : undefined;
            const origPosts = alias(posts, "orig_posts");
            const origUser = alias(user, "orig_user");

            const results = await db
                .select({
                    id: posts.id,
                    userId: posts.userId,
                    content: posts.content,
                    imageUrl: posts.imageUrl,
                    likes: posts.likes,
                    reposts: posts.reposts,
                    comments: posts.comments,
                    views: posts.views,
                    createdAt: posts.createdAt,
                    ticker: posts.ticker,
                    token_image: posts.token_image,
                    repostOfId: posts.repostOfId,
                    isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND likes."userId" = ${ctx.user.id} AND likes."contentType" = 'post')`,
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
                    },
                    bookmarkId: bookmarks.id,
                    bookmarkCreatedAt: bookmarks.createdAt,
                    origId: origPosts.id,
                    origUserId: origPosts.userId,
                    origContent: origPosts.content,
                    origImageUrl: origPosts.imageUrl,
                    origUserName: origUser.name,
                    origUserUsername: origUser.username,
                    origUserAvatar: origUser.avatar_url,
                })
                .from(bookmarks)
                .innerJoin(posts, eq(bookmarks.contentId, posts.id))
                .innerJoin(user, eq(posts.userId, user.id))
                .leftJoin(origPosts, eq(posts.repostOfId, origPosts.id))
                .leftJoin(origUser, eq(origPosts.userId, origUser.id))
                .where(and(
                    eq(bookmarks.userId, ctx.user.id),
                    eq(bookmarks.contentType, "post"),
                    cursorDate ? lt(bookmarks.createdAt, cursorDate) : undefined,
                ))
                .orderBy(desc(bookmarks.createdAt))
                .limit(input.limit + 1);

            const hasMore = results.length > input.limit;
            const rawItems = hasMore ? results.slice(0, input.limit) : results;

            const items = rawItems.map(row => {
                if (row.repostOfId && row.origId) {
                    return {
                        id: row.origId,
                        feedKey: row.id,
                        userId: row.origUserId!,
                        content: row.origContent,
                        imageUrl: row.origImageUrl || null,
                        likes: row.likes,
                        reposts: row.reposts,
                        comments: row.comments,
                        views: row.views,
                        createdAt: row.createdAt,
                        ticker: row.ticker,
                        isLiked: row.isLiked,
                        isBookmarked: true,
                        user: {
                            id: row.origUserId!,
                            name: row.origUserName!,
                            username: row.origUserUsername,
                            avatar_url: row.origUserAvatar,
                        },
                        repostedBy: { name: row.user.name, username: row.user.username },
                    };
                }
                return { ...row, isBookmarked: true, feedKey: null, repostedBy: null };
            });

            return {
                posts: items,
                nextCursor: hasMore ? rawItems[rawItems.length - 1].bookmarkCreatedAt.toISOString() : undefined,
            };
        }),
});
