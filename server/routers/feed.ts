import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { posts, user, mutes, blocks, follows } from "@/db/schema";
import { tokens } from "@/db/schema/content/token";
import { eq, desc, and, lt, sql, inArray, or, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import superjson from "superjson";
import { recordSignal, accumulateDwell, ACTION } from "@/lib/feed-ranker/signals";
import { rankFeedRows } from "@/lib/feed-ranker/rank-feed";
import { retrieveOutOfNetwork } from "@/lib/feed-ranker/retrieval";
import { FEED_RANKER_ENABLED } from "@/lib/feed-ranker/config";
import { effectiveVerifiedTier } from "@/lib/verified-tier";
import { postSelectFields, mapPostRow } from "@/server/lib/post-shape";
import { takePage } from "@/server/lib/paginate";
import { withCache, TTL } from "@/lib/cache";

// Candidate pool size sourced for ranking (then re-ranked + paginated client-side).
const FEED_POOL_SIZE = 200;

// Cache-aside for feed rows: superjson round-trips Dates, so a Redis hit is
// indistinguishable from a fresh query (plain JSON would string-ify createdAt
// and break cursor derivation + the client's Date fields). Stored inside an
// envelope object because the Upstash client auto-JSON.parses GET results —
// a bare superjson string (itself valid JSON) would come back as an object.
const cacheRows = <T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> =>
    withCache(key, ttlSeconds, async () => ({ s: superjson.stringify(await fn()) })).then((env) => superjson.parse<T>(env.s));

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
                const applyMuteRows = ([mutedRows, blockedRows]: [{ mutedId: string }[], { blockedId: string }[]]) => {
                    mutedIds = new Set(mutedRows.map(r => r.mutedId));
                    blockedIds = new Set(blockedRows.map(r => r.blockedId));
                };

                // Start mutes/blocks as soon as the viewer is known — the ranked
                // path below awaits it together with the pool + OON reads so
                // none of the three serializes behind another.
                const muteBlockPromise = ctx.user
                    ? Promise.all([
                        db.select({ mutedId: mutes.mutedId }).from(mutes).where(eq(mutes.muterId, ctx.user.id)),
                        db.select({ blockedId: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, ctx.user.id)),
                    ])
                    : null;

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

                    // The pool, OON discovery (corpus ANN) and mutes/blocks are
                    // independent reads — fire them together; mute filtering and
                    // dedup stay JS-side where they already were.
                    const inNetworkPromise = baseJoins(
                        db.select(selectFields).from(posts)
                    ).where(and(
                        eq(posts.status, "published"),
                        eq(posts.visibility, "public"),
                        lt(posts.createdAt, anchor),
                    )).orderBy(desc(posts.createdAt))
                        .limit(FEED_POOL_SIZE);
                    // OON is only merged into the first page.
                    const oonPromise = offset === 0
                        ? retrieveOutOfNetwork(ctx.user.id, 100)
                        : Promise.resolve([]);

                    const [muteBlockRows, inNetworkRaw, oonCandidates] = await Promise.all([
                        muteBlockPromise!,
                        inNetworkPromise,
                        oonPromise,
                    ]);
                    applyMuteRows(muteBlockRows);

                    const inNetwork = inNetworkRaw.filter((p: any) => !mutedIds.has(p.userId) && !blockedIds.has(p.userId));

                    let pool = inNetwork;
                    const oonIds = oonCandidates
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
                    // Signed-in fallback still needs the mute sets (if the ranked
                    // branch already applied them, re-awaiting the same resolved
                    // promise just re-applies identical values).
                    if (muteBlockPromise) applyMuteRows(await muteBlockPromise);

                    const cursorDate = input.cursor && !input.cursor.startsWith("r:") ? new Date(input.cursor) : undefined;
                    const fetchPage = () => baseJoins(
                        db.select(selectFields).from(posts)
                    ).where(and(
                        eq(posts.status, "published"),
                        eq(posts.visibility, "public"),
                        cursorDate ? lt(posts.createdAt, cursorDate) : undefined,
                    )).orderBy(desc(posts.createdAt))
                        .limit(input.limit + 5);

                    // Signed-out visitors all get the same public page — cache it.
                    const results = ctx.user
                        ? await fetchPage()
                        : await cacheRows(`feed:anon:v1:${input.type}:${input.cursor ?? "top"}:${input.limit}`, TTL.CONTENT_FEED, async () => fetchPage());

                    const filtered = results.filter((p: any) => !mutedIds.has(p.userId) && !blockedIds.has(p.userId));

                    // <any>: the ternary above unions a drizzle result with a
                    // superjson-parsed cache hit, which widens the element to
                    // `{}`. `postsResults` is `any[]` for the same reason.
                    const page = takePage<any>(filtered, input.limit);
                    nextCursor = page.hasMore
                        ? page.lastItem.createdAt.toISOString()
                        : undefined;
                    postsResults = page.items;
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

                const page = takePage<any>(results, input.limit);
                nextCursor = page.hasMore
                    ? page.lastItem.createdAt.toISOString()
                    : undefined;
                postsResults = page.items;
            }

            const mappedPosts = postsResults.map(mapPostRow);

            return { posts: mappedPosts, nextCursor };
        }),

    getVideoFeed: publicProcedure
        .input(z.object({
            cursor: z.string().optional(),
            limit: z.number().min(1).max(50).default(20),
            category: z.string().optional(),
            /**
             * Narrow to videos the CALLER has liked — the home rail's "Liked"
             * tab. A filter on this procedure rather than its own one so the
             * projection, repost resolution and cursor stay identical to the
             * unfiltered feed; the rail and hero consume one row shape.
             */
            likedOnly: z.boolean().default(false),
        }))
        .query(async ({ ctx, input }) => {
            // Ranked path (homepage carousels) uses an anchor cursor like for-you;
            // chronological otherwise. See the for-you branch for the cursor shape.
            // Liked opts out: it's a personal archive, and ranking a set the user
            // already curated by hand would only fight them. Chronological also
            // keeps the plain createdAt cursor, which the ranked path replaces.
            const rankEligible = FEED_RANKER_ENABLED && !!ctx.user && !input.likedOnly;
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

            const fetchPage = () => db
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
                    // The COIN's image, off the token row — not posts.token_image,
                    // which is only written by the post composer and is null for
                    // every video post in the DB. When a creator sets no art,
                    // token creation stores the video's thumbnail here, so this
                    // column is populated either way.
                    tokenImageUrl: postTokens.imageUrl,
                    origTokenId: origPosts.tokenId,
                    origTokenAddress: origTokens.tokenAddress,
                    origMarketCapUsd: origTokens.marketCapUsd,
                    origTokenImageUrl: origTokens.imageUrl,
                    repostOfId: posts.repostOfId,
                    isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND likes."userId" = ${ctx.user?.id ?? ""} AND likes."contentType" = 'post')`,
                    // Same shape, for the header's repost button. COALESCE for the
                    // same reason isLiked uses it: on a repost row the engagement
                    // belongs to the ORIGINAL post, not the repost.
                    isReposted: sql<boolean>`EXISTS (SELECT 1 FROM posts r WHERE r."repostOfId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND r."userId" = ${ctx.user?.id ?? ""} AND r.status = 'published')`,
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
                    // Liked: the same EXISTS the isLiked projection above uses,
                    // promoted to a filter — COALESCE included, so liking the
                    // original surfaces its reposts and vice versa. Signed-out
                    // callers have no likes at all, so short-circuit to an empty
                    // page rather than silently returning the whole feed.
                    input.likedOnly
                        ? (ctx.user
                            ? sql`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND likes."userId" = ${ctx.user.id} AND likes."contentType" = 'post')`
                            : sql`false`)
                        : undefined,
                ))
                .orderBy(desc(posts.createdAt))
                .limit(fetchLimit);

            // Signed-out, non-liked pages are viewer-independent (engagement
            // subqueries key on "") and identical for every visitor — cache
            // them. Signed-in/ranked/liked pages stay live.
            const results = !ctx.user && !input.likedOnly
                ? await cacheRows(`feed:video:anon:v1:${input.category ?? "all"}:${input.cursor ?? "top"}:${input.limit}`, TTL.CONTENT_FEED, async () => fetchPage())
                : await fetchPage();

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
                        tokenImageUrl: s.origTokenImageUrl ?? s.tokenImageUrl,
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

            const fetchPage = () => db
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

            // Same rule as the video feed: signed-out pages are
            // viewer-independent — cache them; signed-in/ranked stay live.
            const results = !ctx.user
                ? await cacheRows(`feed:shorts:anon:v1:${input.cursor ?? "top"}:${input.limit}`, TTL.CONTENT_FEED, async () => fetchPage())
                : await fetchPage();

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
