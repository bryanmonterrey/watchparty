import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { posts, tokens, likes, bookmarks, polls, postUnlocks, seenPosts, videoProgress, videoHeatmap } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, desc, and, count, like, or, ilike, sql, gt, inArray, asc, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { invalidateCache } from "@/lib/cache";
import { createNotification } from "@/server/lib/notify";
import { awardXP } from "@/server/lib/xp";
import { takePage } from "@/server/lib/paginate";
import { encodeKeysetCursor, parseKeysetCursor, keysetAfter } from "@/server/lib/keyset";
import { recordView, viewerHandle } from "@/server/lib/record-view";
import { recordQuestEvent } from "@/server/lib/quests";
import { recordSignal, ACTION } from "@/lib/feed-ranker/signals";
import { upsertPost, deletePost } from "@/lib/typesense/sync";
import { effectiveVerifiedTier } from "@/lib/verified-tier";
import { postSelectFields, mapPostRow } from "@/server/lib/post-shape";
import { verifySolPayment } from "@/lib/chains/solana/verify-sol-payment";
import { createVideoProcedures } from "./content/create-video";
import { createPostProcedures } from "./content/create-post";
import { searchProcedures } from "./content/search";
import { playlistProcedures } from "./content/playlists";
import { captionProcedures } from "./content/captions";
import { draftProcedures } from "./content/drafts";
import { pollProcedures } from "./content/polls";

// ── Split modules ───────────────────────────────────────────────────────────
//
// Spread rather than nested as sub-routers, so every client path stays
// exactly what it was: trpc.content.createPost, not trpc.content.posts.create.
// The split is about file size, and a file split that renames the API is a
// migration wearing a refactor's clothes.
export const contentRouter = router({
    ...createVideoProcedures,
    ...createPostProcedures,
    ...playlistProcedures,
    ...captionProcedures,
    ...draftProcedures,
    ...pollProcedures,
    ...searchProcedures,

    /** Counting rules and the abuse they guard against: server/lib/record-view.ts */
    incrementView: publicProcedure
        .input(z.object({ postId: z.string(), contentType: z.enum(["post", "video"]).default("post") }))
        .mutation(async ({ ctx, input }) => {
            const counted = await recordView(input.postId, viewerHandle(ctx.user?.id, ctx.headers));
            return { success: true, counted };
        }),

    getProgress: protectedProcedure
        .input(z.object({ postId: z.string() }))
        .query(async ({ ctx, input }) => {
            const row = await db.query.videoProgress.findFirst({
                where: and(
                    eq(videoProgress.userId, ctx.session.user.id),
                    eq(videoProgress.postId, input.postId)
                ),
            });
            return { currentTime: row?.currentTime ?? 0 };
        }),

    saveProgress: protectedProcedure
        .input(z.object({ postId: z.string(), currentTime: z.number().min(0) }))
        .mutation(async ({ ctx, input }) => {
            await db.insert(videoProgress)
                .values({
                    userId: ctx.session.user.id,
                    postId: input.postId,
                    currentTime: input.currentTime,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [videoProgress.userId, videoProgress.postId],
                    set: { currentTime: input.currentTime, updatedAt: new Date() },
                });

            // Mark a video-quality-view once the viewer crosses a meaningful watch
            // threshold (~30s). Deterministic id → recorded at most once per (user, post),
            // so the high-frequency progress saves don't flood the signal log.
            if (input.currentTime >= 30) {
                const authorId = (await db.query.posts.findFirst({
                    where: eq(posts.id, input.postId),
                    columns: { userId: true },
                }))?.userId ?? null;
                await recordSignal({
                    userId: ctx.session.user.id,
                    subjectId: input.postId,
                    authorId,
                    actionType: ACTION.VIDEO_VIEW,
                    value: input.currentTime,
                    surface: "shorts",
                    dedupeKey: `vqv_${ctx.session.user.id}_${input.postId}`,
                });
            }
            return { success: true };
        }),

    getHeatmap: publicProcedure
        .input(z.object({ postId: z.string() }))
        .query(async ({ input }) => {
            const rows = await db
                .select({ bucket: videoHeatmap.bucket, hits: videoHeatmap.hits })
                .from(videoHeatmap)
                .where(eq(videoHeatmap.postId, input.postId))
                .orderBy(asc(videoHeatmap.bucket));

            if (rows.length === 0) return { buckets: [] };

            const maxHits = Math.max(...rows.map(r => r.hits));
            const maxBucket = rows[rows.length - 1].bucket;
            const hitMap = new Map(rows.map(r => [r.bucket, r.hits]));

            const buckets = Array.from({ length: maxBucket + 1 }, (_, i) =>
                (hitMap.get(i) ?? 0) / maxHits
            );

            return { buckets };
        }),

    recordHeatmap: publicProcedure
        .input(z.object({ postId: z.string(), bucket: z.number().int().min(0) }))
        .mutation(async ({ input }) => {
            await db.insert(videoHeatmap)
                .values({ postId: input.postId, bucket: input.bucket, hits: 1 })
                .onConflictDoUpdate({
                    target: [videoHeatmap.postId, videoHeatmap.bucket],
                    set: { hits: sql`${videoHeatmap.hits} + 1` },
                });
            return { success: true };
        }),

    toggleLike: protectedProcedure
        .input(z.object({ postId: z.string(), contentType: z.enum(["post", "video"]).default("post").optional() }))
        .mutation(async ({ ctx, input }) => {
            const existing = await db.query.likes.findFirst({
                where: and(
                    eq(likes.contentId, input.postId),
                    eq(likes.userId, ctx.user.id),
                ),
            });

            if (existing) {
                await db.delete(likes).where(eq(likes.id, existing.id));
                await db.update(posts).set({
                    likes: sql`GREATEST(${posts.likes} - 1, 0)`,
                    baseScore: sql`GREATEST(${posts.likes} - 1, 0) * 3.0 + ${posts.reposts} * 2.0 + ${posts.comments} * 2.0 + ${posts.views} * 0.1`,
                }).where(eq(posts.id, input.postId));
                return { liked: false };
            } else {
                await db.insert(likes).values({ id: nanoid(), contentId: input.postId, contentType: "post", userId: ctx.user.id });
                await db.update(posts).set({
                    likes: sql`${posts.likes} + 1`,
                    baseScore: sql`(${posts.likes} + 1) * 3.0 + ${posts.reposts} * 2.0 + ${posts.comments} * 2.0 + ${posts.views} * 0.1`,
                }).where(eq(posts.id, input.postId));
                const post = await db.query.posts.findFirst({ where: eq(posts.id, input.postId) });
                if (post) {
                    await createNotification({ userId: post.userId, actorId: ctx.user.id, type: "like", postId: input.postId });
                    await recordSignal({ userId: ctx.user.id, subjectId: input.postId, authorId: post.userId, actionType: ACTION.FAVORITE });
                    // refId includes the liker so each distinct liker pays once, ever (like→unlike→like can't re-award)
                    if (post.userId !== ctx.user.id) {
                        await awardXP(post.userId, "like_received", `${input.postId}:${ctx.user.id}`);
                        await recordQuestEvent(post.userId, "like_received");
                    }
                }
                return { liked: true };
            }
        }),

    getLikedPostIds: protectedProcedure
        .input(z.object({ postIds: z.array(z.string()), contentType: z.enum(["post", "video"]).default("post").optional() }))
        .query(async ({ ctx, input }) => {
            if (input.postIds.length === 0) return { likedIds: [] };
            const rows = await db
                .select({ contentId: likes.contentId })
                .from(likes)
                .where(and(
                    eq(likes.userId, ctx.user.id),
                    inArray(likes.contentId, input.postIds),
                ));
            return { likedIds: rows.map(r => r.contentId) };
        }),

    toggleBookmark: protectedProcedure
        .input(z.object({ postId: z.string(), contentType: z.enum(["post", "video"]).default("post").optional() }))
        .mutation(async ({ ctx, input }) => {
            const existing = await db.query.bookmarks.findFirst({
                where: and(
                    eq(bookmarks.contentId, input.postId),
                    eq(bookmarks.userId, ctx.user.id),
                ),
            });

            if (existing) {
                await db.delete(bookmarks).where(eq(bookmarks.id, existing.id));
                return { bookmarked: false };
            } else {
                await db.insert(bookmarks).values({ id: nanoid(), contentId: input.postId, contentType: "post", userId: ctx.user.id });
                return { bookmarked: true };
            }
        }),

    getBookmarkedPostIds: protectedProcedure
        .input(z.object({ postIds: z.array(z.string()), contentType: z.enum(["post", "video"]).default("post").optional() }))
        .query(async ({ ctx, input }) => {
            if (input.postIds.length === 0) return { bookmarkedIds: [] };
            const rows = await db
                .select({ contentId: bookmarks.contentId })
                .from(bookmarks)
                .where(and(
                    eq(bookmarks.userId, ctx.user.id),
                    inArray(bookmarks.contentId, input.postIds),
                ));
            return { bookmarkedIds: rows.map(r => r.contentId) };
        }),

    unlockPost: protectedProcedure
        .input(z.object({ postId: z.string(), txSignature: z.string().min(64).max(120) }))
        .mutation(async ({ ctx, input }) => {
            const post = await db.query.posts.findFirst({ where: eq(posts.id, input.postId) });
            if (!post || !post.isPaywalled || !post.paywallPrice) throw new TRPCError({ code: "BAD_REQUEST", message: "Post not paywalled" });

            const existing = await db.query.postUnlocks.findFirst({
                where: and(eq(postUnlocks.postId, input.postId), eq(postUnlocks.userId, ctx.user.id)),
            });
            if (existing) return { success: true, alreadyUnlocked: true };

            // Replay guard, then verify a real SOL transfer actually landed —
            // to the AUTHOR'S wallet looked up server-side, never a
            // client-supplied destination (the previous client build passed
            // the author's userId as if it were a pubkey, which silently
            // fell back to paying the buyer's own wallet on every real post).
            const already = await db.query.postUnlocks.findFirst({ where: eq(postUnlocks.txSignature, input.txSignature) });
            if (already) throw new TRPCError({ code: "CONFLICT", message: "This payment was already redeemed" });

            const [author] = await db.select({ wallet: user.wallet_address }).from(user).where(eq(user.id, post.userId)).limit(1);
            if (!author?.wallet) throw new TRPCError({ code: "BAD_REQUEST", message: "This creator has no wallet on file to receive payment" });

            await verifySolPayment(input.txSignature, post.paywallPrice, author.wallet);

            await db.insert(postUnlocks).values({
                id: nanoid(),
                postId: input.postId,
                userId: ctx.user.id,
                pricePaid: post.paywallPrice,
                txSignature: input.txSignature,
            });
            return { success: true, alreadyUnlocked: false };
        }),

    getUnlockedPostIds: protectedProcedure
        .input(z.object({ postIds: z.array(z.string()) }))
        .query(async ({ ctx, input }) => {
            if (input.postIds.length === 0) return { unlockedIds: [] };
            const rows = await db
                .select({ postId: postUnlocks.postId })
                .from(postUnlocks)
                .where(and(eq(postUnlocks.userId, ctx.user.id), inArray(postUnlocks.postId, input.postIds)));
            return { unlockedIds: rows.map(r => r.postId) };
        }),

    repost: protectedProcedure
        .input(z.object({ postId: z.string(), quoteContent: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
            // Idempotent: check if already reposted (plain repost, not quote)
            if (!input.quoteContent) {
                const existing = await db.query.posts.findFirst({
                    where: and(eq(posts.repostOfId, input.postId), eq(posts.userId, ctx.user.id), eq(posts.status, "published")),
                });
                if (existing) {
                    // Un-repost
                    await db.delete(posts).where(eq(posts.id, existing.id));
                    deletePost(existing.id);
                    await db.update(posts).set({
                        reposts: sql`GREATEST(${posts.reposts} - 1, 0)`,
                        baseScore: sql`${posts.likes} * 3.0 + GREATEST(${posts.reposts} - 1, 0) * 2.0 + ${posts.comments} * 2.0 + ${posts.views} * 0.1`,
                    }).where(eq(posts.id, input.postId));
                    return { reposted: false };
                }
            }

            const repostId = nanoid();
            await db.insert(posts).values({
                id: repostId,
                userId: ctx.user.id,
                repostOfId: input.postId,
                content: input.quoteContent ?? null,
                visibility: "public",
                status: "published",
            });
            if (input.quoteContent) upsertPost({ id: repostId, content: input.quoteContent, userId: ctx.user.id, createdAt: new Date() });
            await db.update(posts).set({
                reposts: sql`${posts.reposts} + 1`,
                baseScore: sql`${posts.likes} * 3.0 + (${posts.reposts} + 1) * 2.0 + ${posts.comments} * 2.0 + ${posts.views} * 0.1`,
            }).where(eq(posts.id, input.postId));

            // Notify original post owner
            const origPost = await db.query.posts.findFirst({ where: eq(posts.id, input.postId) });
            if (origPost) {
                await createNotification({
                    userId: origPost.userId,
                    actorId: ctx.user.id,
                    type: input.quoteContent ? "quote" : "repost",
                    postId: input.postId,
                });
            }
            await recordSignal({
                userId: ctx.user.id,
                subjectId: input.postId,
                authorId: origPost?.userId ?? null,
                actionType: input.quoteContent ? ACTION.QUOTE : ACTION.REPOST,
            });

            await Promise.all([
                invalidateCache("db:feed:v2:for-you:initial:20"),
                invalidateCache("db:feed:v2:following:initial:20"),
            ]);

            return { reposted: true, repostId };
        }),

    getRepostedPostIds: protectedProcedure
        .input(z.object({ postIds: z.array(z.string()) }))
        .query(async ({ ctx, input }) => {
            if (input.postIds.length === 0) return { repostedIds: [] };
            const rows = await db
                .select({ repostOfId: posts.repostOfId })
                .from(posts)
                .where(and(eq(posts.userId, ctx.user.id), inArray(posts.repostOfId as any, input.postIds), eq(posts.status, "published")));
            return { repostedIds: rows.map(r => r.repostOfId).filter(Boolean) as string[] };
        }),

    markPostsSeen: protectedProcedure
        .input(z.object({ postIds: z.array(z.string()).max(100) }))
        .mutation(async ({ ctx, input }) => {
            if (input.postIds.length === 0) return { success: true };
            await db.insert(seenPosts)
                .values(input.postIds.map(postId => ({
                    userId: ctx.user.id,
                    postId,
                })))
                .onConflictDoUpdate({
                    target: [seenPosts.userId, seenPosts.postId],
                    set: { seenAt: sql`NOW()` },
                });
            return { success: true };
        }),

    incrementViews: publicProcedure
        .input(z.object({ postId: z.string() }))
        .mutation(async ({ input }) => {
            // Fire-and-forget view increment — no auth required
            await db.update(posts)
                .set({ reposts: posts.reposts }) // placeholder — views column doesn't exist yet on posts, skip
                .where(eq(posts.id, input.postId));
            return { success: true };
        }),

    pinPost: protectedProcedure
        .input(z.object({ postId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            // Unpin all existing pinned posts by this user first
            await db.update(posts)
                .set({ isPinned: false })
                .where(and(eq(posts.userId, ctx.user.id), eq(posts.isPinned, true)));
            // Pin the requested post
            await db.update(posts)
                .set({ isPinned: true })
                .where(and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id)));
            return { success: true };
        }),

    unpinPost: protectedProcedure
        .input(z.object({ postId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.update(posts)
                .set({ isPinned: false })
                .where(and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id)));
            return { success: true };
        }),

    // ─── Delete own post (soft delete — status flip keeps token/reply refs) ──
    deletePost: protectedProcedure
        .input(z.object({ postId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const [row] = await db.update(posts)
                .set({ status: "deleted", isPinned: false })
                .where(and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id)))
                .returning({ id: posts.id });
            if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });

            // Drop from search + the hot feed caches (same set createPost busts).
            deletePost(row.id).catch(() => {});
            await Promise.all([
                invalidateCache("db:feed:v2:for-you:initial:20"),
                invalidateCache("db:feed:v2:following:initial:20"),
                invalidateCache("db:feed:v2:news:initial:20"),
            ]);
            return { success: true };
        }),

    // ─── Own-post settings (reply privacy / content disclosure) ─────────────
    updatePostSettings: protectedProcedure
        .input(z.object({
            postId: z.string(),
            replyPrivacy: z.enum(["everyone", "followers", "verified", "token_holders"]).optional(),
            hasContentWarning: z.boolean().optional(),
            contentWarningText: z.string().max(200).nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { postId, ...settings } = input;
            const patch = Object.fromEntries(
                Object.entries(settings).filter(([, v]) => v !== undefined)
            );
            if (Object.keys(patch).length === 0) return { success: true };
            const [row] = await db.update(posts)
                .set(patch)
                .where(and(eq(posts.id, postId), eq(posts.userId, ctx.user.id)))
                .returning({ id: posts.id });
            if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
            return { success: true };
        }),

    // ─── Toggle a post in/out of profile Highlights ──────────────────────────
    toggleHighlight: protectedProcedure
        .input(z.object({ postId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const [row] = await db.select({ isHighlight: posts.isHighlight })
                .from(posts)
                .where(and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id)))
                .limit(1);
            if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
            await db.update(posts)
                .set({ isHighlight: !row.isHighlight })
                .where(and(eq(posts.id, input.postId), eq(posts.userId, ctx.user.id)));
            return { isHighlight: !row.isHighlight };
        }),

    // ─── New posts count (for "Show X posts" polling) ────────────────────────
    getNewPostsCount: publicProcedure
        .input(z.object({ since: z.string() }))
        .query(async ({ input }) => {
            const since = new Date(input.since);
            const result = await db
                .select({ count: count() })
                .from(posts)
                .where(and(eq(posts.status, "published"), gt(posts.createdAt, since)));
            return { count: result[0]?.count ?? 0 };
        }),

    // ─── Get posts by user (profile page) ────────────────────────────────────
    getPostsByUser: publicProcedure
        .input(z.object({
            userId: z.string(),
            cursor: z.string().optional(),
            limit: z.number().min(1).max(50).default(20),
            // Profile Posts-tab filter rail
            type: z.enum(["all", "text", "media", "polls", "articles"]).default("all"),
            show: z.enum(["all", "posts", "replies"]).default("all"),
            search: z.string().trim().max(200).optional(),
            sort: z.enum(["newest", "oldest", "top", "views"]).default("newest"),
        }))
        .query(async ({ ctx, input }) => {
            // Cursor semantics per sort: date sorts page on createdAt; the
            // rank sorts (top/views) page on a plain row offset.
            const dateSort = input.sort === "newest" || input.sort === "oldest";
            const dateKey = dateSort ? parseKeysetCursor(input.cursor, "date") : null; // composite (createdAt, id) — see server/lib/keyset.ts
            const offset = !dateSort && input.cursor ? parseInt(input.cursor, 10) || 0 : 0;

            const hasMedia = or(
                isNotNull(posts.imageUrl),
                isNotNull(posts.videoUrl),
                sql`coalesce(jsonb_array_length(${posts.media}), 0) > 0`,
            );
            const typeFilter =
                input.type === "media" ? hasMedia
                : input.type === "text" ? and(
                    sql`${posts.imageUrl} IS NULL`,
                    sql`${posts.videoUrl} IS NULL`,
                    sql`coalesce(jsonb_array_length(${posts.media}), 0) = 0`,
                    eq(posts.isArticle, false),
                )
                : input.type === "polls" ? sql`EXISTS (SELECT 1 FROM polls WHERE polls."postId" = ${posts.id})`
                : input.type === "articles" ? eq(posts.isArticle, true)
                : undefined;
            const showFilter =
                input.show === "posts" ? sql`${posts.replyToId} IS NULL`
                : input.show === "replies" ? isNotNull(posts.replyToId)
                : undefined;
            const searchFilter = input.search
                ? or(ilike(posts.content, `%${input.search}%`), ilike(posts.title, `%${input.search}%`))
                : undefined;

            const orderBy =
                input.sort === "oldest" ? [asc(posts.createdAt), asc(posts.id)]
                : input.sort === "top" ? [desc(posts.likes), desc(posts.createdAt)]
                : input.sort === "views" ? [desc(posts.views), desc(posts.createdAt)]
                // Pinned-first here; `id ASC` is the tiebreak keysetAfter() needs.
                : [desc(posts.isPinned), desc(posts.createdAt), asc(posts.id)];
            const origPosts = alias(posts, "orig_posts");
            const origUser = alias(user, "orig_user");
            const parentPosts = alias(posts, "parent_posts");
            const parentUser = alias(user, "parent_user");

            const results = await db
                .select(postSelectFields({ origPosts, origUser, parentPosts, parentUser, viewerId: ctx.user?.id ?? "" }))
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .leftJoin(origPosts, eq(posts.repostOfId, origPosts.id))
                .leftJoin(origUser, eq(origPosts.userId, origUser.id))
                .leftJoin(parentPosts, eq(posts.replyToId, parentPosts.id))
                .leftJoin(parentUser, eq(parentPosts.userId, parentUser.id))
                .where(
                    and(
                        eq(posts.userId, input.userId),
                        eq(posts.status, "published"),
                        keysetAfter(posts.createdAt, posts.id, dateKey, input.sort === "oldest" ? "asc" : "desc"),
                        typeFilter,
                        showFilter,
                        searchFilter,
                    )
                )
                .orderBy(...orderBy)
                .offset(offset)
                .limit(input.limit + 1);

            const page = takePage(results, input.limit);
            const resultsPage = page.items;
            const nextCursor = page.hasMore
                ? dateSort
                    ? encodeKeysetCursor(page.lastItem!.createdAt, page.lastItem!.id)
                    : String(offset + input.limit)
                : undefined;

            // Total for the toolbar count — first page only (no cursor).
            let total: number | undefined;
            if (!input.cursor) {
                const [t] = await db.select({ n: count() }).from(posts).where(
                    and(
                        eq(posts.userId, input.userId),
                        eq(posts.status, "published"),
                        typeFilter,
                        showFilter,
                        searchFilter,
                    )
                );
                total = t?.n ?? 0;
            }

            const mappedResults = resultsPage.map(mapPostRow);

            return { posts: mappedResults, nextCursor, total };
        }),

    // ─── Per-filter counts for the profile Posts-tab rail ────────────────────
    getPostFilterCounts: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ input }) => {
            const [row] = await db
                .select({
                    all: count(),
                    text: sql<number>`count(*) filter (where ${posts.imageUrl} is null and ${posts.videoUrl} is null and coalesce(jsonb_array_length(${posts.media}), 0) = 0 and ${posts.isArticle} = false)`,
                    media: sql<number>`count(*) filter (where ${posts.imageUrl} is not null or ${posts.videoUrl} is not null or coalesce(jsonb_array_length(${posts.media}), 0) > 0)`,
                    polls: sql<number>`count(*) filter (where exists (select 1 from polls where polls."postId" = ${posts.id}))`,
                    articles: sql<number>`count(*) filter (where ${posts.isArticle})`,
                    posts: sql<number>`count(*) filter (where ${posts.replyToId} is null)`,
                    replies: sql<number>`count(*) filter (where ${posts.replyToId} is not null)`,
                })
                .from(posts)
                .where(and(eq(posts.userId, input.userId), eq(posts.status, "published")));
            return row ?? { all: 0, text: 0, media: 0, polls: 0, articles: 0, posts: 0, replies: 0 };
        }),

    // ─── Get a single video post by ID ───────────────────────────────────────
    getVideoById: publicProcedure
        .input(z.object({ postId: z.string() }))
        .query(async ({ ctx, input }) => {
            const result = await db
                .select({
                    id: posts.id,
                    title: posts.title,
                    content: posts.content,
                    videoUrl: posts.videoUrl,
                    thumbnailUrl: posts.thumbnailUrl,
                    duration: posts.duration,
                    views: posts.views,
                    likes: posts.likes,
                    comments: posts.comments,
                    createdAt: posts.createdAt,
                    userId: posts.userId,
                    visibility: posts.visibility,
                    status: posts.status,
                    category: posts.category,
                    collaborators: posts.collaborators,
                    isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = ${posts.id} AND likes."userId" = ${ctx.user?.id ?? ""} AND likes."contentType" = 'post')`,
                    // Same shape as isLiked, so the header's Save row knows whether
                    // it's already saved instead of starting at "not saved".
                    isBookmarked: sql<boolean>`EXISTS (SELECT 1 FROM bookmarks WHERE bookmarks."contentId" = ${posts.id} AND bookmarks."userId" = ${ctx.user?.id ?? ""})`,
                    // Same shape as isLiked, so the header's repost button knows
                    // its state on first paint instead of guessing. A plain
                    // repost is a published post row pointing back at this one
                    // (see the repost mutation's own idempotency check).
                    isReposted: sql<boolean>`EXISTS (SELECT 1 FROM posts r WHERE r."repostOfId" = ${posts.id} AND r."userId" = ${ctx.user?.id ?? ""} AND r.status = 'published')`,
                    author: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        wallet_address: user.wallet_address,
                        verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
                        affiliateUsername: user.affiliateUsername,
                        affiliateIconUrl: user.affiliateIconUrl,
                        followerCount: sql<number>`(SELECT COUNT(*) FROM follows WHERE follows."followingId" = ${user.id})`,
                    },
                    // Attached token for the under-player chip (design brief §2) —
                    // null id means no token; shaped to null below.
                    token: {
                        id: tokens.id,
                        tokenAddress: tokens.tokenAddress,
                        ticker: tokens.ticker,
                        name: tokens.name,
                        imageUrl: tokens.imageUrl,
                        priceUsd: tokens.priceUsd,
                        marketCapUsd: tokens.marketCapUsd,
                        bondingProgress: tokens.bondingProgress,
                        phase: tokens.phase,
                        status: tokens.status,
                    },
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .leftJoin(tokens, eq(posts.tokenId, tokens.id))
                .where(and(eq(posts.id, input.postId), isNotNull(posts.videoUrl)))
                .limit(1);

            const row = result[0];
            if (!row) return null;
            // Drafts included. The status === "live" gate here is why no coin
            // line appeared under an unlaunched video: tokens.status is
            // "draft" | "live", content always creates a draft, and the first
            // buyer is what flips it. Dropping drafts made Launch unreachable.
            // The UI decides what to show from tokenAddress (the mint), which
            // only exists once it has actually launched.
            return { ...row, token: row.token?.id ? row.token : null };
        }),

    // ─── Get public videos for "Up Next" sidebar ─────────────────────────────
    getPublicVideos: publicProcedure
        .input(z.object({
            excludePostId: z.string().optional(),
            limit: z.number().min(1).max(20).default(12),
            cursor: z.string().optional(),
        }))
        .query(async ({ input }) => {
            const vidOffset = input.cursor ? Math.max(0, parseInt(input.cursor, 10) || 0) : 0; // ranked sort → OFFSET

            const results = await db
                .select({
                    id: posts.id,
                    title: posts.title,
                    thumbnailUrl: posts.thumbnailUrl,
                    duration: posts.duration,
                    views: posts.views,
                    createdAt: posts.createdAt,
                    author: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        wallet_address: user.wallet_address,
                        verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
                        affiliateUsername: user.affiliateUsername,
                        affiliateIconUrl: user.affiliateIconUrl,
                    },
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .where(
                    and(
                        eq(posts.status, "published"),
                        eq(posts.visibility, "public"),
                        isNotNull(posts.videoUrl),
                        input.excludePostId ? sql`${posts.id} != ${input.excludePostId}` : undefined,
                    )
                )
                .orderBy(desc(posts.baseScore), desc(posts.createdAt))
                .offset(vidOffset)
                .limit(input.limit + 1);

            // The NOTE that used to sit here was right: a createdAt-only cursor
            // against a baseScore-first sort skips and repeats rows. Measured on
            // the identical shape in comment.getComments — page 2 repeated 19 of
            // page 1 and 40 of 60 rows were unreachable. OFFSET instead.
            const { items, hasMore } = takePage(results, input.limit);
            const nextCursor = hasMore ? String(vidOffset + input.limit) : undefined;

            return { videos: items, nextCursor };
        }),

    // ─── Get videos by a specific user ───────────────────────────────────────
    getVideosByUser: publicProcedure
        .input(z.object({
            userId: z.string(),
            excludePostId: z.string().optional(),
            limit: z.number().min(1).max(20).default(12),
        }))
        .query(async ({ input }) => {
            const results = await db
                .select({
                    id: posts.id,
                    title: posts.title,
                    thumbnailUrl: posts.thumbnailUrl,
                    duration: posts.duration,
                    views: posts.views,
                    createdAt: posts.createdAt,
                    author: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        wallet_address: user.wallet_address,
                        verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
                        affiliateUsername: user.affiliateUsername,
                        affiliateIconUrl: user.affiliateIconUrl,
                    },
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .where(
                    and(
                        eq(posts.userId, input.userId),
                        eq(posts.status, "published"),
                        eq(posts.visibility, "public"),
                        isNotNull(posts.videoUrl),
                        input.excludePostId ? sql`${posts.id} != ${input.excludePostId}` : undefined,
                    )
                )
                .orderBy(desc(posts.createdAt))
                .limit(input.limit);

            return { videos: results };
        }),

    // ─── Get image posts for a user's Media tab (Instagram-style grid) ───────
    getMediaByUser: publicProcedure
        .input(z.object({
            userId: z.string(),
            limit: z.number().min(1).max(60).default(60),
        }))
        .query(async ({ input }) => {
            const rows = await db
                .select({
                    id: posts.id,
                    imageUrl: posts.imageUrl,
                    media: posts.media,
                })
                .from(posts)
                .where(
                    and(
                        eq(posts.userId, input.userId),
                        eq(posts.status, "published"),
                        eq(posts.visibility, "public"),
                        or(
                            isNotNull(posts.imageUrl),
                            sql`coalesce(jsonb_array_length(${posts.media}), 0) > 0`,
                        ),
                    )
                )
                .orderBy(desc(posts.createdAt))
                .limit(input.limit);

            const items = rows
                .map((r) => ({
                    id: r.id,
                    images: [
                        ...(r.imageUrl ? [r.imageUrl] : []),
                        ...(r.media ?? []).filter((m) => m.type === "image").map((m) => m.url),
                    ],
                }))
                .filter((r) => r.images.length > 0);

            return { items };
        }),

    // ─── Get related videos by category ──────────────────────────────────────
    getRelatedVideos: publicProcedure
        .input(z.object({
            category: z.string().nullable().optional(),
            excludePostId: z.string().optional(),
            limit: z.number().min(1).max(20).default(12),
        }))
        .query(async ({ input }) => {
            const results = await db
                .select({
                    id: posts.id,
                    title: posts.title,
                    thumbnailUrl: posts.thumbnailUrl,
                    duration: posts.duration,
                    views: posts.views,
                    createdAt: posts.createdAt,
                    author: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        wallet_address: user.wallet_address,
                        verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
                        affiliateUsername: user.affiliateUsername,
                        affiliateIconUrl: user.affiliateIconUrl,
                    },
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .where(
                    and(
                        eq(posts.status, "published"),
                        eq(posts.visibility, "public"),
                        isNotNull(posts.videoUrl),
                        input.category ? eq(posts.category, input.category) : undefined,
                        input.excludePostId ? sql`${posts.id} != ${input.excludePostId}` : undefined,
                    )
                )
                .orderBy(desc(posts.baseScore), desc(posts.createdAt))
                .limit(input.limit);

            return { videos: results };
        }),
});
