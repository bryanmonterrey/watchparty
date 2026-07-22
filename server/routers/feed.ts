import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { posts, user, mutes, blocks, follows } from "@/db/schema";
import { tokens } from "@/db/schema/content/token";
import { eq, desc, and, lt, sql, inArray, or, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordSignal, accumulateDwell, ACTION } from "@/lib/feed-ranker/signals";
import { rankFeedRows } from "@/lib/feed-ranker/rank-feed";
import { retrieveOutOfNetwork } from "@/lib/feed-ranker/retrieval";
import { FEED_RANKER_ENABLED } from "@/lib/feed-ranker/config";
import { effectiveVerifiedTier } from "@/lib/verified-tier";
import { postSelectFields, mapPostRow } from "@/server/lib/post-shape";

// Candidate pool size sourced for ranking (then re-ranked + paginated client-side).
const FEED_POOL_SIZE = 200;

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

            const selectFields = postSelectFields({ origPosts, origUser, parentPosts, parentUser, viewerId: ctx.user?.id ?? "" });

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

                // Ranked path: cursor "r:<anchorISO>:<offset>" pins a candidate pool
                // (posts as of the anchor time) so pagination is stable while we
                // re-rank. Falls through to chronological if the ranker is off or
                // the service is unavailable.
                let ranked = false;
                if (FEED_RANKER_ENABLED && ctx.user) {
                    const isRankCursor = input.cursor?.startsWith("r:");
                    const anchor = isRankCursor
                        ? new Date(input.cursor!.slice(2, input.cursor!.lastIndexOf(":")))
                        : new Date();
                    const offset = isRankCursor ? Number(input.cursor!.slice(input.cursor!.lastIndexOf(":") + 1)) : 0;

                    // In-network / recent pool.
                    const inNetwork = (await baseJoins(
                        db.select(selectFields).from(posts)
                    ).where(and(
                        eq(posts.status, "published"),
                        eq(posts.visibility, "public"),
                        lt(posts.createdAt, anchor),
                    )).orderBy(desc(posts.createdAt))
                        .limit(FEED_POOL_SIZE))
                        .filter((p: any) => !mutedIds.has(p.userId) && !blockedIds.has(p.userId));

                    // Out-of-network discovery (corpus ANN) — only on the first page,
                    // merged + deduped into the pool. Best-effort: empty on cold-start
                    // or if retrieval is unavailable.
                    let pool = inNetwork;
                    if (offset === 0) {
                        const oonIds = (await retrieveOutOfNetwork(ctx.user.id, 100))
                            .map((c) => c.id)
                            .filter((id) => !inNetwork.some((p: any) => p.id === id));
                        if (oonIds.length > 0) {
                            const extra = (await baseJoins(
                                db.select(selectFields).from(posts)
                            ).where(and(
                                eq(posts.status, "published"),
                                eq(posts.visibility, "public"),
                                inArray(posts.id, oonIds),
                            )))
                                .filter((p: any) => !mutedIds.has(p.userId) && !blockedIds.has(p.userId));
                            pool = [...inNetwork, ...extra];
                        }
                    }

                    const reordered = await rankFeedRows(ctx.user.id, "for-you", pool as any[]);
                    if (reordered) {
                        postsResults = reordered.slice(offset, offset + input.limit);
                        if (offset + input.limit < reordered.length) {
                            nextCursor = `r:${anchor.toISOString()}:${offset + input.limit}`;
                        }
                        ranked = true;
                    }
                }

                if (!ranked) {
                    const cursorDate = input.cursor && !input.cursor.startsWith("r:") ? new Date(input.cursor) : undefined;
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
                }
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

            const mappedPosts = postsResults.map(mapPostRow);

            return { posts: mappedPosts, nextCursor };
        }),

    getVideoFeed: publicProcedure
        .input(z.object({ 
            cursor: z.string().optional(), 
            limit: z.number().min(1).max(50).default(20),
            category: z.string().optional()
        }))
        .query(async ({ ctx, input }) => {
            // Ranked path (homepage carousels) uses an anchor cursor like for-you;
            // chronological otherwise. See the for-you branch for the cursor shape.
            const rankEligible = FEED_RANKER_ENABLED && !!ctx.user;
            const isRankCursor = input.cursor?.startsWith("r:");
            const rankAnchor = isRankCursor
                ? new Date(input.cursor!.slice(2, input.cursor!.lastIndexOf(":")))
                : new Date();
            const rankOffset = isRankCursor ? Number(input.cursor!.slice(input.cursor!.lastIndexOf(":") + 1)) : 0;
            const cursorDate = input.cursor && !isRankCursor ? new Date(input.cursor) : undefined;
            const effectiveCursorDate = rankEligible ? rankAnchor : cursorDate;
            const fetchLimit = rankEligible ? FEED_POOL_SIZE : input.limit + 1;
            const origPosts = alias(posts, "orig_posts");
            const origUser = alias(user, "orig_user");
            // Cached market columns on tokens (written by the token-stream
            // worker) — powers the market-cap chips with zero RPC on read.
            const postTokens = alias(tokens, "post_tokens");
            const origTokens = alias(tokens, "orig_tokens");

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
                    tokenId: posts.tokenId,
                    tokenAddress: postTokens.tokenAddress,
                    marketCapUsd: postTokens.marketCapUsd,
                    origTokenId: origPosts.tokenId,
                    origTokenAddress: origTokens.tokenAddress,
                    origMarketCapUsd: origTokens.marketCapUsd,
                    repostOfId: posts.repostOfId,
                    isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND likes."userId" = ${ctx.user?.id ?? ""} AND likes."contentType" = 'post')`,
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        wallet_address: user.wallet_address,
                        verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
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
                        verifiedTier: effectiveVerifiedTier(origUser.verifiedTier, origUser.hideVerifiedBadge),
                    }
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .leftJoin(origPosts, eq(posts.repostOfId, origPosts.id))
                .leftJoin(origUser, eq(origPosts.userId, origUser.id))
                .leftJoin(postTokens, eq(posts.tokenId, postTokens.id))
                .leftJoin(origTokens, eq(origPosts.tokenId, origTokens.id))
                .where(and(
                    eq(posts.status, "published"),
                    or(isNotNull(posts.videoUrl), isNotNull(origPosts.videoUrl)),
                    effectiveCursorDate ? lt(posts.createdAt, effectiveCursorDate) : undefined,
                    // "Live" is a pseudo-category meaning live streams (isLive),
                    // not a literal category value. Other categories match
                    // case-insensitively so creator-entered casing/whitespace
                    // doesn't hide content.
                    input.category
                        ? (input.category.toLowerCase() === "live"
                            ? eq(posts.isLive, true)
                            : sql`lower(${posts.category}) = lower(${input.category})`)
                        : undefined,
                ))
                .orderBy(desc(posts.createdAt))
                .limit(fetchLimit);

            // Chronological pagination (used as-is when not ranking; the ranked
            // path re-slices + overrides nextCursor below).
            const hasMore = !rankEligible && results.length > input.limit;
            const rawItems = !rankEligible && results.length > input.limit ? results.slice(0, input.limit) : results;

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
                        tokenId: s.origTokenId ?? s.tokenId,
                        tokenAddress: s.origTokenAddress ?? s.tokenAddress,
                        marketCapUsd: s.origMarketCapUsd ?? s.marketCapUsd,
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

            // Ranked path: reorder the pool via Phoenix and paginate by offset.
            if (rankEligible) {
                const surface = input.category ? "categories" : "trending";
                const reordered = await rankFeedRows(ctx.user!.id, surface, videos as any[]);
                if (reordered) {
                    const page = (reordered as typeof videos).slice(rankOffset, rankOffset + input.limit);
                    return {
                        videos: page,
                        nextCursor: rankOffset + input.limit < reordered.length
                            ? `r:${rankAnchor.toISOString()}:${rankOffset + input.limit}`
                            : undefined,
                    };
                }
                // ranker unavailable → chronological fallback over the fetched pool
                const fb = results.length > input.limit;
                return {
                    videos: (videos as typeof videos).slice(0, input.limit),
                    nextCursor: fb ? rawItems[input.limit - 1]?.createdAt.toISOString() : undefined,
                };
            }

            return {
                videos,
                nextCursor: hasMore ? rawItems[rawItems.length - 1].createdAt.toISOString() : undefined,
            };
        }),

    getShortsFeed: publicProcedure
        .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20) }))
        .query(async ({ ctx, input }) => {
            const rankEligible = FEED_RANKER_ENABLED && !!ctx.user;
            const isRankCursor = input.cursor?.startsWith("r:");
            const rankAnchor = isRankCursor
                ? new Date(input.cursor!.slice(2, input.cursor!.lastIndexOf(":")))
                : new Date();
            const rankOffset = isRankCursor ? Number(input.cursor!.slice(input.cursor!.lastIndexOf(":") + 1)) : 0;
            const cursorDate = input.cursor && !isRankCursor ? new Date(input.cursor) : undefined;
            const effectiveCursorDate = rankEligible ? rankAnchor : cursorDate;
            const fetchLimit = rankEligible ? FEED_POOL_SIZE : input.limit + 1;
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
                        wallet_address: user.wallet_address,
                        verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
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
                        verifiedTier: effectiveVerifiedTier(origUser.verifiedTier, origUser.hideVerifiedBadge),
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
                    effectiveCursorDate ? lt(posts.createdAt, effectiveCursorDate) : undefined,
                ))
                .orderBy(desc(posts.createdAt))
                .limit(fetchLimit);

            const hasMore = !rankEligible && results.length > input.limit;
            const rawItems = !rankEligible && results.length > input.limit ? results.slice(0, input.limit) : results;

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

            if (rankEligible) {
                const reordered = await rankFeedRows(ctx.user!.id, "shorts", shorts as any[]);
                if (reordered) {
                    const page = (reordered as typeof shorts).slice(rankOffset, rankOffset + input.limit);
                    return {
                        shorts: page,
                        nextCursor: rankOffset + input.limit < reordered.length
                            ? `r:${rankAnchor.toISOString()}:${rankOffset + input.limit}`
                            : undefined,
                    };
                }
                const fb = results.length > input.limit;
                return {
                    shorts: (shorts as typeof shorts).slice(0, input.limit),
                    nextCursor: fb ? rawItems[input.limit - 1]?.createdAt.toISOString() : undefined,
                };
            }

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

    // Dwell — visible time on a feed card, sent incrementally by the client
    // (IntersectionObserver). Accumulated server-side into ONE capped row per
    // (user, subject) via accumulateDwell, so a long/idle session can't create
    // thousands of rows or inflate the signal.
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
                .map((it) => accumulateDwell({
                    userId: ctx.user.id,
                    subjectId: it.subjectId,
                    subjectType: it.subjectType,
                    authorId: it.authorId ?? null,
                    seconds: it.seconds,
                    surface: it.surface,
                })));
            return { success: true };
        }),
});
