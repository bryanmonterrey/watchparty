/**
 * The post composer's write path.
 *
 * The single largest procedure in the router: a post can carry media, a poll, a
 * paywall, a schedule, a token launch and its tags, and each of those is a
 * branch here.
 *
 * Split out of server/routers/content.ts, which was 1580 lines against a
 * 1000-line guard. Pure move — these procedures are byte-identical to what
 * lived there, and they are spread back into the same router, so every caller
 * path (trpc.content.*) is unchanged.
 */
import { z } from "zod";
import { publicStorageUrl } from "@/lib/supabase/public-url";
import { protectedProcedure } from "../../trpc";
import { db } from "@/db";
import { writePostTags, postTagsInput } from "@/server/lib/write-post-tags";
import { posts, escrows, tokens, likes, polls } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, and, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { invalidateCache } from "@/lib/cache";
import { createNotification } from "@/server/lib/notify";
import { awardXP } from "@/server/lib/xp";
import { recordQuestEvent } from "@/server/lib/quests";
import { upsertPost, upsertToken } from "@/lib/typesense/sync";
import { normalizeUrl } from "./shared";

export const createPostProcedures = {
    createPost: protectedProcedure
        .input(
            z.object({
                content: z.string().optional(),
                imageUrl: z.string().optional(),
                media: z.array(z.object({ type: z.enum(["image", "video", "audio"]), url: z.string() })).optional(),
                visibility: z.enum(["public", "private", "unlisted"]).default("public"),
                audience: z.enum(["everyone", "followers", "verified", "token_holders", "community", "vip"]).default("everyone"),
                replyPrivacy: z.enum(["everyone", "followers", "verified", "token_holders"]).default("everyone"),
                communityId: z.string().optional(),
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
                token_image: z.string().optional(),
                twitterUrl: z.string().optional(),
                telegramUrl: z.string().optional(),
                websiteUrl: z.string().optional(),
                // Pay-Per-View
                isPaywalled: z.boolean().optional(),
                paywallPrice: z.number().optional(), // lamports
                // Content warning
                duration: z.number().optional(),
                hasContentWarning: z.boolean().optional(),
                contentWarningText: z.string().optional(),
                // Link Preview
                linkPreview: z.object({
                    url: z.string(),
                    title: z.string().nullable().optional(),
                    description: z.string().nullable().optional(),
                    imageUrl: z.string().nullable().optional(),
                    siteName: z.string().nullable().optional(),
                }).optional(),
                // Scheduling / Draft
                status: z.enum(["draft", "scheduled", "published"]).default("published"),
                scheduledFor: z.date().optional(),
                // Poll
                poll: z.object({
                    question: z.string().min(1),
                    options: z.array(z.object({ id: z.string(), text: z.string(), imageUrl: z.string().url().optional() })).min(2).max(4),
                    allowMultiple: z.boolean().default(false),
                    endsAt: z.date().optional(),
                }).optional(),
                // Threading / Engagement
                replyToId: z.string().optional(),
                /**
                 * Client-supplied post id. The composer needs the post's URL
                 * BEFORE the post exists, because the coin's on-chain metadata
                 * embeds it as external_url and the launch happens first. So the
                 * client generates the id, hands it to the launch, then hands
                 * the same one here.
                 *
                 * Safe: the column is the primary key, so a reused id fails the
                 * insert rather than overwriting anything.
                 */
                id: z.string().min(8).max(64).optional(),
                repostOfId: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            if (!input.content && !input.imageUrl && !input.poll) {
                console.error("SERVER: Error missing content");
                throw new Error("Post must have content, image, or poll");
            }

            const postId = input.id ?? nanoid();
            let tokenId: string | undefined = undefined;
            // Hoisted so the POST row can store the same resolved image as the
            // TOKEN row. It used to be a const inside the `if (input.ticker)`
            // block, so `posts.token_image` got the raw `input.token_image`
            // while `tokens.imageUrl` got the full media→avatar fallback — and
            // the composer usually doesn't send token_image at all. Result: the
            // coin had an image everywhere it read from `tokens`, and the feed
            // card's ticker pill (which reads posts.token_image) showed the
            // blank tinted disc.
            let tokenImage: string | undefined = input.token_image;

            if (input.ticker) {
                tokenId = input.tokenStatus === "live" ? (input.tokenAddress || nanoid()) : nanoid();

                // Token name: explicit override -> first line of post -> ticker.
                const tokenName =
                    input.tokenName?.trim() ||
                    input.content?.split('\n')[0]?.trim().slice(0, 32) ||
                    input.ticker;
                // Token image: post media -> creator avatar, and the avatar step is
                // resolved HERE rather than trusted to the client.
                //
                // This used to end at input.imageUrl, on the assumption that the
                // composer had already folded the avatar into token_image. Any
                // caller that didn't — a coin created with no post behind it, which
                // is what a stream's coin is — minted imageless. 11 rows in the DB
                // got created that way; see db/token-image-avatar-backfill.sql.
                // The video path above already did this; now both do.
                const postSessionUser = ctx.session.user as { avatar_url?: string | null; image?: string | null };
                tokenImage = publicStorageUrl(
                    input.token_image ||
                    input.imageUrl?.split(',')[0] ||
                    postSessionUser.avatar_url ||
                    postSessionUser.image ||
                    undefined,
                ) ?? undefined;

                await db.insert(tokens).values({
                    id: tokenId,
                    tokenAddress: input.tokenAddress,
                    poolAddress: input.poolAddress,
                    ticker: input.ticker,
                    name: tokenName,
                    description: input.content,
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
                id: postId,
                userId: ctx.session.user.id,
                content: input.content,
                imageUrl: input.imageUrl,
                visibility: input.visibility,
                audience: input.audience,
                replyPrivacy: input.replyPrivacy,
                communityId: input.communityId,
                status: input.status,
                tokenId,
                ticker: input.ticker ?? null,
                tokenStatus: input.tokenStatus ?? (input.earningsEnabled ? "draft" : null),
                token_image: tokenImage,
                media: input.media ?? [],
                isPaywalled: input.isPaywalled ?? false,
                paywallPrice: input.paywallPrice,
                hasContentWarning: input.hasContentWarning ?? false,
                contentWarningText: input.contentWarningText,
                linkPreview: input.linkPreview ? {
                    url: input.linkPreview.url,
                    title: input.linkPreview.title ?? null,
                    description: input.linkPreview.description ?? null,
                    imageUrl: input.linkPreview.imageUrl ?? null,
                    siteName: input.linkPreview.siteName ?? null,
                } : null,
                scheduledFor: input.scheduledFor,
                replyToId: input.replyToId,
                repostOfId: input.repostOfId,
            });
            if (input.tags?.length) await writePostTags(postId, input.tags); // server/lib/write-post-tags
            if (input.status === "published" && input.content) upsertPost({ id: postId, content: input.content, userId: ctx.session.user.id, imageUrl: input.imageUrl, createdAt: new Date() });
            if (input.status === "published") {
                await awardXP(ctx.session.user.id, "post_created", postId);
                await recordQuestEvent(ctx.session.user.id, "post_created");
                if (tokenId && input.tokenStatus === "live") {
                    await awardXP(ctx.session.user.id, "token_launched", tokenId);
                    await recordQuestEvent(ctx.session.user.id, "token_launched");
                }
            }

            if (input.poll) {
                const options = input.poll.options.map(o => ({ ...o, votesCount: 0 }));
                await db.insert(polls).values({
                    id: nanoid(),
                    postId,
                    userId: ctx.session.user.id,
                    question: input.poll.question,
                    options,
                    allowMultiple: input.poll.allowMultiple,
                    endsAt: input.poll.endsAt,
                });
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

            // Only bust feed cache for published posts
            if (input.status === "published") {
                // Handle parent post increments
                if (input.replyToId) {
                    await db.update(posts)
                        .set({
                            comments: sql`${posts.comments} + 1`,
                            baseScore: sql`${posts.likes} * 3.0 + ${posts.reposts} * 2.0 + (${posts.comments} + 1) * 2.0 + ${posts.views} * 0.1`,
                        })
                        .where(eq(posts.id, input.replyToId));
                    
                    const parent = await db.query.posts.findFirst({ where: eq(posts.id, input.replyToId) });
                    if (parent) await createNotification({ userId: parent.userId, actorId: ctx.session.user.id, type: "comment", postId: input.replyToId });
                }

                if (input.repostOfId) {
                    await db.update(posts)
                        .set({
                            reposts: sql`${posts.reposts} + 1`,
                            baseScore: sql`${posts.likes} * 3.0 + (${posts.reposts} + 1) * 2.0 + ${posts.comments} * 2.0 + ${posts.views} * 0.1`,
                        })
                        .where(eq(posts.id, input.repostOfId));
                    
                    const orig = await db.query.posts.findFirst({ where: eq(posts.id, input.repostOfId) });
                    if (orig) await createNotification({ userId: orig.userId, actorId: ctx.session.user.id, type: "quote", postId: input.repostOfId });
                }

                await Promise.all([
                    invalidateCache("db:feed:v2:for-you:initial:20"),
                    invalidateCache("db:feed:v2:following:initial:20"),
                    invalidateCache("db:feed:v2:news:initial:20"),
                ]);
            }

            return { success: true, postId };
        }),
};
