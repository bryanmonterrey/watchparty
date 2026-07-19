import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { copySubscriptions, subscriptions } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { and, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";

/**
 * Copy-trade config (docs/exp-callouts.md §4d). Access model: the trader must
 * share trades AND the follower must hold an ACTIVE creator subscription to
 * the trader — copying is the paid perk of subscribing to a trader.
 * Execution is prepared-order pushes for now (see server/lib/trade-fanout.ts);
 * these rows become the caps for the on-chain executor later.
 */

async function hasActiveSub(followerId: string, traderId: string): Promise<boolean> {
    const [sub] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(
            eq(subscriptions.subscriberId, followerId),
            eq(subscriptions.creatorId, traderId),
            eq(subscriptions.status, "active"),
            gt(subscriptions.currentPeriodEnd, new Date()),
        ))
        .limit(1);
    return !!sub;
}

export const copyRouter = router({
    /** State for a trader's profile: can I copy, and my current config. */
    status: protectedProcedure
        .input(z.object({ traderId: z.string() }))
        .query(async ({ ctx, input }) => {
            const [trader] = await db
                .select({ shareTrades: user.shareTrades })
                .from(user)
                .where(eq(user.id, input.traderId));
            const [config] = await db
                .select()
                .from(copySubscriptions)
                .where(and(eq(copySubscriptions.followerId, ctx.user.id), eq(copySubscriptions.traderId, input.traderId)));
            return {
                traderShares: !!trader?.shareTrades,
                subscribed: await hasActiveSub(ctx.user.id, input.traderId),
                config: config ?? null,
            };
        }),

    /** Create/update a copy config. Requires the active-sub gate. */
    upsert: protectedProcedure
        .input(z.object({
            traderId: z.string(),
            maxUsdcPerCopy: z.number().min(1).max(1_000),
            dailyUsdcCap: z.number().min(1).max(5_000),
            paused: z.boolean().default(false),
        }))
        .mutation(async ({ ctx, input }) => {
            if (input.traderId === ctx.user.id) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "You can't copy yourself" });
            }
            const [trader] = await db
                .select({ shareTrades: user.shareTrades })
                .from(user)
                .where(eq(user.id, input.traderId));
            if (!trader?.shareTrades) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "This trader doesn't share trades" });
            }
            if (!(await hasActiveSub(ctx.user.id, input.traderId))) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Copying requires an active subscription to this trader" });
            }
            if (input.dailyUsdcCap < input.maxUsdcPerCopy) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Daily cap must be at least the per-copy amount" });
            }

            await db
                .insert(copySubscriptions)
                .values({
                    id: nanoid(),
                    followerId: ctx.user.id,
                    traderId: input.traderId,
                    maxUsdcPerCopy: input.maxUsdcPerCopy,
                    dailyUsdcCap: input.dailyUsdcCap,
                    paused: input.paused,
                })
                .onConflictDoUpdate({
                    target: [copySubscriptions.followerId, copySubscriptions.traderId],
                    set: {
                        maxUsdcPerCopy: input.maxUsdcPerCopy,
                        dailyUsdcCap: input.dailyUsdcCap,
                        paused: input.paused,
                        updatedAt: new Date(),
                    },
                });
            return { ok: true };
        }),

    remove: protectedProcedure
        .input(z.object({ traderId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db
                .delete(copySubscriptions)
                .where(and(eq(copySubscriptions.followerId, ctx.user.id), eq(copySubscriptions.traderId, input.traderId)));
            return { ok: true };
        }),

    /** My copy configs, with trader identity for the settings list. */
    mine: protectedProcedure.query(async ({ ctx }) => {
        const rows = await db
            .select({
                traderId: copySubscriptions.traderId,
                maxUsdcPerCopy: copySubscriptions.maxUsdcPerCopy,
                dailyUsdcCap: copySubscriptions.dailyUsdcCap,
                paused: copySubscriptions.paused,
                trader: { name: user.name, username: user.username, avatar_url: user.avatar_url, level: user.level },
            })
            .from(copySubscriptions)
            .innerJoin(user, eq(copySubscriptions.traderId, user.id))
            .where(eq(copySubscriptions.followerId, ctx.user.id));
        return { copies: rows };
    }),
});
