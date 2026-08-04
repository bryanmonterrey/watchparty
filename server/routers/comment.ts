import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { likes, posts, polls } from "@/db/schema/content";
import { tokens } from "@/db/schema/content/token";
import { user } from "@/db/schema/auth";
import { eq, desc, and, asc, sql, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createNotification } from "@/server/lib/notify";
import { awardXP } from "@/server/lib/xp";
import { recordQuestEvent } from "@/server/lib/quests";
import { recordSignal, ACTION } from "@/lib/feed-ranker/signals";
import { follows } from "@/db/schema/content/follow";
import { upsertPost, deletePost } from "@/lib/typesense/sync";

export const commentRouter = router({
    getComments: publicProcedure
        .input(z.object({
            postId: z.string(),
            cursor: z.string().optional(),
            limit: z.number().min(1).max(50).default(20),
        }))
        .query(async ({ ctx, input }) => {
            const cursorDate = input.cursor ? new Date(input.cursor) : undefined;

            // Get post author ID
            const postAuthor = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, input.postId)).limit(1);
            const postAuthorId = postAuthor[0]?.userId;

            const rows = await db
                .select({
                    id: posts.id,
                    postId: posts.replyToId,
                    userId: posts.userId,
                    parentId: posts.replyToId,
                    parentUsername: sql<string | null>`(SELECT username FROM "user" WHERE id = (SELECT "userId" FROM posts WHERE id = ${posts.replyToId}))`,
                    content: posts.content,
                    imageUrl: posts.imageUrl,
                    videoUrl: posts.videoUrl,
                    thumbnailUrl: posts.thumbnailUrl,
                    duration: posts.duration,
                    likes: posts.likes,
                    reposts: posts.reposts,
                    comments: posts.comments,
                    views: posts.views,
                    isPinned: posts.isPinned,
                    createdAt: posts.createdAt,
                    bookmarks: sql<number>`(SELECT count(*) FROM bookmarks WHERE bookmarks."contentId" = ${posts.id} AND bookmarks."contentType" = 'post')`,
                    isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = ${posts.id} AND likes."userId" = ${ctx.user?.id ?? ""} AND likes."contentType" = 'post')`,
                    isBookmarked: sql<boolean>`EXISTS (SELECT 1 FROM bookmarks WHERE bookmarks."contentId" = ${posts.id} AND bookmarks."userId" = ${ctx.user?.id ?? ""} AND bookmarks."contentType" = 'post')`,
                    isReposted: sql<boolean>`EXISTS (SELECT 1 FROM posts rp WHERE rp."repostOfId" = ${posts.id} AND rp."userId" = ${ctx.user?.id ?? ""} AND rp."status" = 'published')`,
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                    },
                    isAuthor: sql<boolean>`${posts.userId} = ${postAuthorId || ''}`,
                    isFollowing: ctx.user ? sql<boolean>`EXISTS (
                        SELECT 1 FROM ${follows} 
                        WHERE ${follows.followerId} = ${ctx.user.id} 
                        AND ${follows.followingId} = ${posts.userId}
                    )` : sql<boolean>`false`,
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .where(and(
                    eq(posts.replyToId, input.postId),
                    eq(posts.status, "published"),
                    // lt(), not sql`... < ${cursorDate}` — an interpolated value
                    // carries no column, so drizzle can't encode the Date and
                    // postgres.js gets it raw, which throws on Workers
                    // (ERR_INVALID_ARG_TYPE, "Received an instance of Date").
                    // Page 1 has no cursor, so only replies past the first page
                    // were affected — the same shape of bug as coinFeed.list.
                    cursorDate ? lt(posts.createdAt, cursorDate) : undefined,
                ))
                .orderBy(
                    desc(posts.isPinned), 
                    desc(sql`${posts.userId} = ${postAuthorId || ''}`),
                    desc(ctx.user ? sql`EXISTS (SELECT 1 FROM ${follows} WHERE ${follows.followerId} = ${ctx.user.id} AND ${follows.followingId} = ${posts.userId})` : sql`false`),
                    desc(posts.likes),
                    desc(posts.createdAt)
                )
                .limit(input.limit + 1);

            let nextCursor: string | undefined;
            if (rows.length > input.limit) {
                const next = rows.pop();
                nextCursor = next?.createdAt.toISOString();
            }
            return { comments: rows, nextCursor };
        }),

    getReplies: publicProcedure
        .input(z.object({ parentId: z.string(), limit: z.number().min(1).max(20).default(10) }))
        .query(async ({ ctx, input }) => {
            const rows = await db
                .select({
                    id: posts.id,
                    postId: posts.replyToId,
                    userId: posts.userId,
                    parentId: posts.replyToId,
                    parentUsername: sql<string | null>`(SELECT username FROM "user" WHERE id = (SELECT "userId" FROM posts WHERE id = ${posts.replyToId}))`,
                    content: posts.content,
                    imageUrl: posts.imageUrl,
                    videoUrl: posts.videoUrl,
                    thumbnailUrl: posts.thumbnailUrl,
                    duration: posts.duration,
                    likes: posts.likes,
                    reposts: posts.reposts,
                    comments: posts.comments,
                    views: posts.views,
                    isPinned: posts.isPinned,
                    createdAt: posts.createdAt,
                    bookmarks: sql<number>`(SELECT count(*) FROM bookmarks WHERE bookmarks."contentId" = ${posts.id} AND bookmarks."contentType" = 'post')`,
                    isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = ${posts.id} AND likes."userId" = ${ctx.user?.id ?? ""} AND likes."contentType" = 'post')`,
                    isBookmarked: sql<boolean>`EXISTS (SELECT 1 FROM bookmarks WHERE bookmarks."contentId" = ${posts.id} AND bookmarks."userId" = ${ctx.user?.id ?? ""} AND bookmarks."contentType" = 'post')`,
                    isReposted: sql<boolean>`EXISTS (SELECT 1 FROM posts rp WHERE rp."repostOfId" = ${posts.id} AND rp."userId" = ${ctx.user?.id ?? ""} AND rp."status" = 'published')`,
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                    },
                })
                .from(posts)
                .innerJoin(user, eq(posts.userId, user.id))
                .where(and(
                    eq(posts.replyToId, input.parentId),
                    eq(posts.status, "published")
                ))
                .orderBy(asc(posts.createdAt))
                .limit(input.limit);
            return { replies: rows };
        }),

    createComment: protectedProcedure
        .input(z.object({
            postId: z.string(),
            parentId: z.string().optional(),
            // Was min(1): a reply used to be text or nothing. Now an image or a
            // GIF alone is a valid reply, same as the post composer, so the
            // emptiness check moved to "no text AND no media" below.
            content: z.string().max(1000).default(""),
            imageUrl: z.string().optional(),
            media: z.array(z.object({
                type: z.enum(["image", "video", "audio"]),
                url: z.string(),
            })).optional(),
            linkPreview: z.object({
                url: z.string(),
                title: z.string().nullable().optional(),
                description: z.string().nullable().optional(),
                imageUrl: z.string().nullable().optional(),
                siteName: z.string().nullable().optional(),
            }).optional(),
            // Token launch — a reply can carry a coin, same as a post. Mirrors
            // content.createPost's surface so the two can't drift.
            ticker: z.string().optional(),
            tokenName: z.string().optional(),
            token_image: z.string().optional(),
            tokenAddress: z.string().optional(),
            poolAddress: z.string().optional(),
            creatorFeePercent: z.number().optional(),
            tokenStatus: z.enum(["draft", "live"]).optional(),
            earningsEnabled: z.boolean().optional(),
            splits: z.array(z.any()).optional(),
            twitterUrl: z.string().optional(),
            telegramUrl: z.string().optional(),
            websiteUrl: z.string().optional(),
            // The rest of the composer's toolbox. Replies are posts rows, so
            // every one of these columns already existed — createComment simply
            // never accepted them.
            poll: z.object({
                question: z.string().min(1),
                options: z.array(z.object({ id: z.string(), text: z.string(), imageUrl: z.string().url().optional() })).min(2).max(4),
                allowMultiple: z.boolean().default(false),
                endsAt: z.date().optional(),
            }).optional(),
            isPaywalled: z.boolean().optional(),
            paywallPrice: z.number().optional(),
            hasContentWarning: z.boolean().optional(),
            contentWarningText: z.string().optional(),
            /** Seconds — a voice note's length, so the player can show it
             *  before the audio loads. */
            duration: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const hasMedia = !!input.imageUrl || (input.media?.length ?? 0) > 0 || !!input.poll;
            if (!input.content.trim() && !hasMedia) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "A reply needs text or media" });
            }

            const replyId = nanoid();
            const actualReplyToId = input.parentId || input.postId;

            // A reply can launch a coin, same as a post. Mirrors createPost's
            // token block, including the image fallback resolved HERE rather
            // than trusted to the client — a coin minted without an image was a
            // real bug on the post side (db/post-token-image-backfill.sql) and
            // there's no reason to reproduce it on this one.
            let tokenId: string | undefined;
            let tokenImage: string | undefined = input.token_image;

            if (input.ticker) {
                tokenId = input.tokenStatus === "live" ? (input.tokenAddress || nanoid()) : nanoid();

                const tokenName =
                    input.tokenName?.trim() ||
                    input.content?.split("\n")[0]?.trim().slice(0, 32) ||
                    input.ticker;

                const replySessionUser = ctx.user as { avatar_url?: string | null; image?: string | null };
                tokenImage =
                    input.token_image ||
                    input.imageUrl ||
                    replySessionUser.avatar_url ||
                    replySessionUser.image ||
                    undefined;

                await db.insert(tokens).values({
                    id: tokenId,
                    tokenAddress: input.tokenAddress,
                    poolAddress: input.poolAddress,
                    ticker: input.ticker,
                    name: tokenName,
                    description: input.content,
                    imageUrl: tokenImage,
                    creatorFeePercent: input.creatorFeePercent,
                    status: input.tokenStatus || "draft",
                    earningsEnabled: input.earningsEnabled,
                    splits: input.splits,
                    creatorId: ctx.user.id,
                });
            }

            // Replies ARE posts rows, so these columns already existed — the
            // procedure simply never accepted them, which is why the reply box
            // could only ever be a single line of text.
            await db.insert(posts).values({
                id: replyId,
                userId: ctx.user.id,
                content: input.content,
                imageUrl: input.imageUrl,
                media: input.media ?? [],
                // Normalized the same way createPost does it: the column's type
                // has every field present as string | null, while the zod input
                // marks them optional — so an absent title arrives as undefined
                // and doesn't satisfy the column. Coerce each to null.
                linkPreview: input.linkPreview
                    ? {
                        url: input.linkPreview.url,
                        title: input.linkPreview.title ?? null,
                        description: input.linkPreview.description ?? null,
                        imageUrl: input.linkPreview.imageUrl ?? null,
                        siteName: input.linkPreview.siteName ?? null,
                    }
                    : undefined,
                replyToId: actualReplyToId,
                tokenId,
                ticker: input.ticker ?? null,
                tokenStatus: input.tokenStatus ?? (input.earningsEnabled ? "draft" : null),
                token_image: tokenImage,
                duration: input.duration,
                isPaywalled: input.isPaywalled ?? false,
                paywallPrice: input.paywallPrice,
                hasContentWarning: input.hasContentWarning ?? false,
                contentWarningText: input.contentWarningText,
                status: "published",
                visibility: "public",
                audience: "everyone",
                replyPrivacy: "everyone",
            });
            if (input.poll) {
                const options = input.poll.options.map((o) => ({ ...o, votesCount: 0 }));
                await db.insert(polls).values({
                    id: nanoid(),
                    postId: replyId,
                    userId: ctx.user.id,
                    question: input.poll.question,
                    options,
                    allowMultiple: input.poll.allowMultiple,
                    endsAt: input.poll.endsAt,
                });
            }

            upsertPost({ id: replyId, content: input.content, userId: ctx.user.id, createdAt: new Date() });

            // Increment parent comment count
            await db.update(posts)
                .set({
                    comments: sql`${posts.comments} + 1`,
                    baseScore: sql`${posts.likes} * 3.0 + ${posts.reposts} * 2.0 + (${posts.comments} + 1) * 2.0 + ${posts.views} * 0.1`,
                })
                .where(eq(posts.id, actualReplyToId));

            // Notify parent author
            const parent = await db.query.posts.findFirst({ where: eq(posts.id, actualReplyToId) });
            if (parent) {
                await createNotification({
                    userId: parent.userId,
                    actorId: ctx.user.id,
                    type: "comment",
                    postId: actualReplyToId,
                });
            }
            await recordSignal({
                userId: ctx.user.id,
                subjectId: actualReplyToId,
                authorId: parent?.userId ?? null,
                actionType: ACTION.REPLY,
            });
            // No XP for replying to yourself (own-thread farming)
            if (parent && parent.userId !== ctx.user.id) {
                await awardXP(ctx.user.id, "comment_created", replyId);
                await recordQuestEvent(ctx.user.id, "comment_created");
            }

            return { id: replyId };
        }),

    deleteComment: protectedProcedure
        .input(z.object({ commentId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const comment = await db.query.posts.findFirst({
                where: and(eq(posts.id, input.commentId), eq(posts.userId, ctx.user.id))
            });
            if (!comment) throw new Error("Comment not found or unauthorized");

            await db.update(posts).set({ status: "deleted" }).where(eq(posts.id, input.commentId));
            deletePost(input.commentId);

            if (comment.replyToId) {
                await db.update(posts)
                    .set({ comments: sql`${posts.comments} - 1` })
                    .where(eq(posts.id, comment.replyToId));
            }

            return { success: true };
        }),

    toggleCommentLike: protectedProcedure
        .input(z.object({ commentId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            // Re-using the same 'likes' table but with contentType 'post' since comments are now posts
            const existing = await db
                .select()
                .from(likes)
                .where(and(
                    eq(likes.contentId, input.commentId),
                    eq(likes.userId, ctx.user.id),
                    eq(likes.contentType, "post")
                ))
                .limit(1);

            if (existing.length > 0) {
                await db.delete(likes).where(eq(likes.id, existing[0].id));
                await db.update(posts).set({ likes: sql`${posts.likes} - 1` }).where(eq(posts.id, input.commentId));
                return { liked: false };
            } else {
                await db.insert(likes).values({
                    id: nanoid(),
                    contentId: input.commentId,
                    userId: ctx.user.id,
                    contentType: "post"
                });
                await db.update(posts).set({ likes: sql`${posts.likes} + 1` }).where(eq(posts.id, input.commentId));
                return { liked: true };
            }
        }),

    getLikedCommentIds: protectedProcedure
        .input(z.object({ commentIds: z.array(z.string()) }))
        .query(async ({ ctx, input }) => {
            if (input.commentIds.length === 0) return { likedIds: [] };
            const rows = await db
                .select({ commentId: likes.contentId })
                .from(likes)
                .where(and(eq(likes.userId, ctx.user.id), inArray(likes.contentId, input.commentIds), eq(likes.contentType, "post")));
            return { likedIds: rows.map(r => r.commentId) };
        }),

    pinComment: protectedProcedure
        .input(z.object({ commentId: z.string(), pinned: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const comment = await db.query.posts.findFirst({ where: eq(posts.id, input.commentId) });
            if (!comment) throw new Error("Comment not found");
            // Only post author can pin
            const postAuthor = await db.query.posts.findFirst({ where: eq(posts.id, comment.replyToId ?? "") });
            if (!postAuthor || postAuthor.userId !== ctx.user.id) throw new Error("Only the post author can pin comments");
            await db.update(posts)
                .set({ isPinned: input.pinned })
                .where(eq(posts.id, input.commentId));
            return { success: true };
        }),
});
