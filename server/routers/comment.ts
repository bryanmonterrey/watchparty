import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { likes, posts } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, desc, and, asc, sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createNotification } from "@/server/lib/notify";
import { awardXP } from "@/server/lib/xp";
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
                    cursorDate ? sql`${posts.createdAt} < ${cursorDate}` : undefined,
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
            content: z.string().min(1).max(1000),
        }))
        .mutation(async ({ ctx, input }) => {
            const replyId = nanoid();
            const actualReplyToId = input.parentId || input.postId;

            await db.insert(posts).values({
                id: replyId,
                userId: ctx.user.id,
                content: input.content,
                replyToId: actualReplyToId,
                status: "published",
                visibility: "public",
                audience: "everyone",
                replyPrivacy: "everyone",
            });
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
