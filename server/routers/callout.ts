import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import { callouts, tokens, follows, notifications } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { recordQuestEvent } from "@/server/lib/quests";
import { emitCalloutEvent } from "@/lib/coin-feed/emit";
import { sendPushToUsers } from "@/lib/push/send";

/**
 * pump.fun-style callouts (docs/exp-callouts.md, Phase 2).
 * One call per user per 6h; snapshots the cached market columns on `tokens`
 * (no RPC on this path), fans out a "callout" notification to followers.
 * peakGainPct is advanced by /api/cron/callout-performance.
 */

export const CALLOUT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const LEADERBOARD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// A single lottery-ticket call can't own the board: per-call score is capped at +1000%.
const PER_CALL_GAIN_CAP = 10;

async function lastCalloutAt(userId: string): Promise<Date | null> {
    const [row] = await db
        .select({ createdAt: callouts.createdAt })
        .from(callouts)
        .where(eq(callouts.userId, userId))
        .orderBy(desc(callouts.createdAt))
        .limit(1);
    return row?.createdAt ?? null;
}

export const calloutRouter = router({
    /** Cooldown state for the button (countdown UI). */
    cooldown: protectedProcedure.query(async ({ ctx }) => {
        const last = await lastCalloutAt(ctx.user.id);
        const nextAt = last ? new Date(last.getTime() + CALLOUT_COOLDOWN_MS) : null;
        const canCall = !nextAt || nextAt.getTime() <= Date.now();
        return { canCall, nextAt: canCall ? null : nextAt };
    }),

    create: protectedProcedure
        .input(z.object({ tokenId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const token = await db.query.tokens.findFirst({ where: eq(tokens.id, input.tokenId) });
            if (!token || token.status !== "live" || !token.poolAddress) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Token isn't tradeable" });
            }
            if (token.priceUsd == null || token.priceUsd <= 0) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "No price data for this token yet" });
            }

            const last = await lastCalloutAt(ctx.user.id);
            if (last && last.getTime() + CALLOUT_COOLDOWN_MS > Date.now()) {
                throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You can call out once every 6 hours" });
            }

            const id = nanoid();
            await db.insert(callouts).values({
                id,
                userId: ctx.user.id,
                tokenId: token.id,
                priceAtCall: token.priceUsd,
                marketCapAtCall: token.marketCapUsd,
            });

            await recordQuestEvent(ctx.user.id, "callout_created");

            // Also surface the call in the /home coin alert rail. Best-effort:
            // emitCalloutEvent swallows its own errors so a feed write can never
            // undo a callout that already landed.
            await emitCalloutEvent({
                calloutId: id,
                userId: ctx.user.id,
                token: {
                    wpTokenId: token.id,
                    tokenAddress: token.tokenAddress,
                    ticker: token.ticker,
                    imageUrl: token.imageUrl,
                    marketCapUsd: token.marketCapUsd,
                },
            });

            // Fan out to followers. Chunked inserts; non-critical, never fails the call.
            let notified = 0;
            try {
                const followers = await db
                    .select({ followerId: follows.followerId })
                    .from(follows)
                    .where(eq(follows.followingId, ctx.user.id));
                const body = `called out $${token.ticker}`;
                for (let i = 0; i < followers.length; i += 500) {
                    const chunk = followers.slice(i, i + 500);
                    await db.insert(notifications).values(chunk.map((f) => ({
                        id: nanoid(),
                        userId: f.followerId,
                        actorId: ctx.user.id,
                        type: "callout" as const,
                        postId: token.id, // token slug for the View deep link
                        body,
                    })));
                    notified += chunk.length;
                }
                if (notified > 0) {
                    await db.update(callouts).set({ notifiedCount: notified }).where(eq(callouts.id, id));
                    // Web push is what makes a callout land when followers aren't
                    // on the site. Subscriptions are the opt-in; dead ones prune.
                    const caller = ctx.user.name || "Someone you follow";
                    await sendPushToUsers(followers.map((f) => f.followerId), {
                        title: `${caller} called out $${token.ticker}`,
                        body: token.marketCapUsd ? `at $${Math.round(token.marketCapUsd).toLocaleString()} mcap — see the call` : "See the call",
                        url: "/trade/callouts",
                        tag: `callout-${id}`,
                    });
                }
            } catch { /* fan-out failure must not undo the callout */ }

            return { id, notified };
        }),

    /** Global feed of recent callouts, newest first. */
    feed: publicProcedure
        .input(z.object({
            limit: z.number().min(1).max(50).default(30),
            cursor: z.string().optional(), // createdAt ISO of the last row
        }).optional())
        .query(async ({ input }) => {
            const limit = input?.limit ?? 30;
            const rows = await db
                .select({
                    id: callouts.id,
                    createdAt: callouts.createdAt,
                    priceAtCall: callouts.priceAtCall,
                    marketCapAtCall: callouts.marketCapAtCall,
                    peakGainPct: callouts.peakGainPct,
                    caller: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        level: user.level,
                    },
                    token: {
                        id: tokens.id,
                        ticker: tokens.ticker,
                        name: tokens.name,
                        imageUrl: tokens.imageUrl,
                        priceUsd: tokens.priceUsd,
                        marketCapUsd: tokens.marketCapUsd,
                        tokenAddress: tokens.tokenAddress,
                    },
                })
                .from(callouts)
                .innerJoin(user, eq(callouts.userId, user.id))
                .innerJoin(tokens, eq(callouts.tokenId, tokens.id))
                .where(input?.cursor ? lt(callouts.createdAt, new Date(input.cursor)) : undefined)
                .orderBy(desc(callouts.createdAt))
                .limit(limit + 1);

            const hasMore = rows.length > limit;
            const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
                ...r,
                // Live gain since the call, from the cached price (may lag peak).
                currentGainPct: r.token.priceUsd && r.priceAtCall > 0 ? r.token.priceUsd / r.priceAtCall - 1 : 0,
            }));
            return {
                items,
                nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : undefined,
            };
        }),

    /** Top callers over the last 7 days, by sum of capped peak gains. */
    leaderboard: publicProcedure.query(async () => {
        const since = new Date(Date.now() - LEADERBOARD_WINDOW_MS);
        const score = sql<number>`sum(least(${callouts.peakGainPct}, ${PER_CALL_GAIN_CAP}))`;
        const rows = await db
            .select({
                userId: callouts.userId,
                name: user.name,
                username: user.username,
                avatar_url: user.avatar_url,
                level: user.level,
                calls: sql<number>`count(*)::int`,
                bestGainPct: sql<number>`max(${callouts.peakGainPct})`,
                score,
            })
            .from(callouts)
            .innerJoin(user, eq(callouts.userId, user.id))
            .where(gte(callouts.createdAt, since))
            .groupBy(callouts.userId, user.name, user.username, user.avatar_url, user.level)
            .orderBy(desc(score))
            .limit(20);
        return { since, callers: rows };
    }),
});
