import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import { pnlSnapshots } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { and, desc, eq } from "drizzle-orm";

/**
 * PnL read surface + trade-sharing opt-in (docs/exp-callouts.md §4b–4c).
 * Snapshots are materialized by /api/cron/pnl-snapshots; everything here is
 * a filtered read. Public reads only ever expose users with shareTrades on.
 */
export const pnlRouter = router({
    /** Top traders over a window — sharing users only. */
    leaderboard: publicProcedure
        .input(z.object({ window: z.enum(["24h", "7d", "30d"]).default("7d") }).optional())
        .query(async ({ input }) => {
            const window = input?.window ?? "7d";
            const rows = await db
                .select({
                    userId: pnlSnapshots.userId,
                    name: user.name,
                    username: user.username,
                    avatar_url: user.avatar_url,
                    level: user.level,
                    realizedUsd: pnlSnapshots.realizedUsd,
                    volumeUsd: pnlSnapshots.volumeUsd,
                    tradeCount: pnlSnapshots.tradeCount,
                    winRate: pnlSnapshots.winRate,
                })
                .from(pnlSnapshots)
                .innerJoin(user, eq(pnlSnapshots.userId, user.id))
                .where(and(eq(pnlSnapshots.window, window), eq(user.shareTrades, true)))
                .orderBy(desc(pnlSnapshots.realizedUsd))
                .limit(20);
            return { window, traders: rows };
        }),

    /** One user's PnL card. Owner always sees it; others only if shared. */
    forUser: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ ctx, input }) => {
            const [u] = await db
                .select({ shareTrades: user.shareTrades })
                .from(user)
                .where(eq(user.id, input.userId));
            const isOwner = ctx.user?.id === input.userId;
            if (!u || (!u.shareTrades && !isOwner)) return { visible: false as const, shareTrades: false, windows: [] };

            const rows = await db
                .select()
                .from(pnlSnapshots)
                .where(eq(pnlSnapshots.userId, input.userId));
            return {
                visible: true as const,
                shareTrades: u.shareTrades,
                windows: rows.map((r) => ({
                    window: r.window,
                    realizedUsd: r.realizedUsd,
                    volumeUsd: r.volumeUsd,
                    tradeCount: r.tradeCount,
                    winRate: r.winRate,
                })),
            };
        }),

    /** Opt in/out of public trades (notifications + card + leaderboard). */
    setSharing: protectedProcedure
        .input(z.object({ share: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await db.update(user).set({ shareTrades: input.share }).where(eq(user.id, ctx.user.id));
            return { shareTrades: input.share };
        }),
});
