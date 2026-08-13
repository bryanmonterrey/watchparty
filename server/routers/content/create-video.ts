/**
 * The video composer's write path: the procedure that turns an upload into a
 * post, plus the collaborator search its form drives.
 *
 * A video IS a post — same table, same tags — which is why this sits beside
 * create-post rather than in a "videos" module of its own.
 *
 * Split out of server/routers/content.ts, which was 1580 lines against a
 * 1000-line guard. Pure move — these procedures are byte-identical to what
 * lived there, and they are spread back into the same router, so every caller
 * path (trpc.content.*) is unchanged.
 */
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { db } from "@/db";
import { writePostTags, postTagsInput } from "@/server/lib/write-post-tags";
import { posts, playlistVideos, escrows, tokens } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, and, like, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withCache, TTL } from "@/lib/cache";
import { awardXP } from "@/server/lib/xp";
import { recordQuestEvent } from "@/server/lib/quests";
import { upsertPost, upsertToken } from "@/lib/typesense/sync";
import { normalizeUrl } from "./shared";

export const createVideoProcedures = {
    createVideo: protectedProcedure
        .input(
            z.object({
                title: z.string().min(1),
                description: z.string().optional(),
                videoUrl: z.string().url(),
                thumbnailUrl: z.string().url().optional(),
                visibility: z.enum(["public", "private", "unlisted"]),
                duration: z.number().default(0),
                scheduledFor: z.date().optional(),
                playlistIds: z.array(z.string()).optional(),
                id: z.string().optional(),
                tags: postTagsInput,
                // Token Launch
                tokenAddress: z.string().optional(),
                poolAddress: z.string().optional(),
                creatorFeePercent: z.number().optional(),
                tokenStatus: z.enum(["draft", "live"]).optional(),
                earningsEnabled: z.boolean().optional(),
                splits: z.array(z.any()).optional(),
                ticker: z.string().optional(),
                tokenName: z.string().optional(),
                twitterUrl: z.string().optional(),
                telegramUrl: z.string().optional(),
                websiteUrl: z.string().optional(),
                // Audience & permissions
                audience: z.enum(["everyone", "followers", "verified", "token_holders"]).default("everyone"),
                whoCanComment: z.enum(["everyone", "followers", "verified", "none"]).default("everyone"),
                allowedCommenters: z.array(z.object({
                    id: z.string(),
                    name: z.string(),
                    avatar_url: z.string().optional(),
                })).optional(),
                // Metadata
                category: z.string().optional(),
                language: z.array(z.string()).optional(),
                recordingDate: z.date().optional(),
                videoLocation: z.string().optional(),
                // Collaboration
                collaborators: z.array(z.object({
                    id: z.string(),
                    name: z.string(),
                    username: z.string().optional(),
                    avatar_url: z.string().optional(),
                })).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const videoId = input.id || nanoid();
            let tokenId: string | undefined = undefined;

            if (input.earningsEnabled && input.ticker) {
                tokenId = input.tokenStatus === "live" ? (input.tokenAddress || nanoid()) : nanoid();

                // Token name: explicit override -> video title -> ticker.
                const tokenName = input.tokenName?.trim() || input.title.slice(0, 32) || input.ticker;
                // Token image: video thumbnail -> creator avatar.
                const sessionUser = ctx.session.user as { avatar_url?: string | null; image?: string | null };
                const tokenImage = input.thumbnailUrl || sessionUser.avatar_url || sessionUser.image || undefined;

                await db.insert(tokens).values({
                    id: tokenId,
                    tokenAddress: input.tokenAddress,
                    poolAddress: input.poolAddress,
                    ticker: input.ticker,
                    name: tokenName,
                    description: input.description,
                    imageUrl: tokenImage,
                    twitterUrl: normalizeUrl(input.twitterUrl),
                    telegramUrl: normalizeUrl(input.telegramUrl),
                    websiteUrl: normalizeUrl(input.websiteUrl),
                    creatorFeePercent: input.creatorFeePercent,
                    status: input.tokenStatus || "draft",
                    earningsEnabled: input.earningsEnabled,
                    splits: input.splits,
                    creatorId: ctx.session.user.id,
                });
                upsertToken({ id: tokenId, name: tokenName, ticker: input.ticker, tokenAddress: input.tokenAddress, imageUrl: tokenImage, createdAt: new Date() });

                // Live launch with a pool → put its pool on the Helius trades
                // webhook now (not at the daily re-sync) so external trades
                // stream in from the first minute. Fire-and-forget.
                if (input.tokenStatus === "live" && input.poolAddress) {
                    import("@/lib/tokens/trades-webhook")
                        .then(({ syncTradesWebhook }) => syncTradesWebhook())
                        .catch((e) => console.error("trades-webhook sync after launch failed", e));
                }
            }

            await db.insert(posts).values({
                id: videoId,
                userId: ctx.session.user.id,
                title: input.title,
                content: input.description,
                videoUrl: input.videoUrl,
                thumbnailUrl: input.thumbnailUrl,
                visibility: input.visibility,
                duration: input.duration,
                scheduledFor: input.scheduledFor,
                status: "published",
                tokenId,
                ticker: input.earningsEnabled && input.ticker ? input.ticker : null,
                tokenStatus: input.earningsEnabled && input.ticker ? (input.tokenStatus || "draft") : null,
                audience: input.audience || "everyone",
                replyPrivacy: (input.whoCanComment === "none" ? "everyone" : input.whoCanComment) as any,
                category: input.category,
                language: input.language ?? [],
                recordingDate: input.recordingDate,
                videoLocation: input.videoLocation,
                collaborators: input.collaborators,
                isShort: false,
            });
            if (input.tags?.length) await writePostTags(videoId, input.tags); // a video IS a post
            if (input.description) upsertPost({ id: videoId, content: input.description, userId: ctx.session.user.id, imageUrl: input.thumbnailUrl, createdAt: new Date() });
            await awardXP(ctx.session.user.id, "post_created", videoId);
            await recordQuestEvent(ctx.session.user.id, "post_created");
            if (tokenId && input.tokenStatus === "live") {
                await awardXP(ctx.session.user.id, "token_launched", tokenId);
                await recordQuestEvent(ctx.session.user.id, "token_launched");
            }

            if (input.playlistIds && input.playlistIds.length > 0) {
                const playlistInserts = input.playlistIds.map(playlistId => ({
                    playlistId,
                    postId: videoId,
                    position: 0
                }));
                await db.insert(playlistVideos).values(playlistInserts);
            }

            if (input.earningsEnabled && input.splits && input.splits.length > 0) {
                const pendingEscrowIds = input.splits
                    .filter((s: any) => s.escrowId)
                    .map((s: any) => s.escrowId);

                if (pendingEscrowIds.length > 0 && tokenId) {
                    for (const id of pendingEscrowIds) {
                        await db.update(escrows)
                            .set({ tokenId: tokenId })
                            .where(eq(escrows.id, id));
                    }
                }
            }

            return { success: true, videoId };
        }),

    searchCollaborators: protectedProcedure
        .input(z.object({ query: z.string().min(1), limit: z.number().default(8) }))
        .query(async ({ ctx, input }) => {
            return withCache(
                `db:collaborators:${input.query.toLowerCase()}:${input.limit}`,
                TTL.COLLABORATORS,
                async () => {
                    const pattern = `%${input.query}%`;
                    const users = await db
                        .select({ id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url })
                        .from(user)
                        .where(or(like(user.name, pattern), like(user.username, pattern)))
                        .limit(input.limit);
                    return { users };
                }
            );
        }),
};
