import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import { pnlSnapshots, trades, tokens } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { CASH_MINTS } from "@/server/lib/pnl";

// Shape confirmed trades into readable rows: which non-cash mint moved, which
// direction, and the token identity when the mint is a launchpad token.
async function shapeTrades(rows: {
    id: string;
    userId: string;
    inputMint: string;
    outputMint: string;
    usdValue: number | null;
    confirmedAt: Date | null;
    source: string;
}[]) {
    const shaped = rows.flatMap((t) => {
        const inCash = CASH_MINTS.has(t.inputMint);
        const outCash = CASH_MINTS.has(t.outputMint);
        if (inCash === outCash) return [];
        const mint = inCash ? t.outputMint : t.inputMint;
        return [{
            id: t.id,
            userId: t.userId,
            side: inCash ? ("buy" as const) : ("sell" as const),
            mint,
            usdValue: t.usdValue,
            confirmedAt: t.confirmedAt,
            source: t.source,
        }];
    });
    const mints = [...new Set(shaped.map((s) => s.mint))];
    const toks = mints.length
        ? await db
              .select({ tokenAddress: tokens.tokenAddress, ticker: tokens.ticker, name: tokens.name, imageUrl: tokens.imageUrl })
              .from(tokens)
              .where(inArray(tokens.tokenAddress, mints))
        : [];
    const tokByMint = new Map(toks.map((t) => [t.tokenAddress!, t]));
    return shaped.map((s) => ({ ...s, token: tokByMint.get(s.mint) ?? null }));
}

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
                    unrealizedUsd: pnlSnapshots.unrealizedUsd,
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
                    unrealizedUsd: r.unrealizedUsd,
                    volumeUsd: r.volumeUsd,
                    tradeCount: r.tradeCount,
                    winRate: r.winRate,
                })),
            };
        }),

    /** One user's confirmed trade history. Owner always; others when shared. */
    tradesForUser: publicProcedure
        .input(z.object({ userId: z.string(), limit: z.number().min(1).max(50).default(30), cursor: z.string().optional() }))
        .query(async ({ ctx, input }) => {
            const [u] = await db.select({ shareTrades: user.shareTrades }).from(user).where(eq(user.id, input.userId));
            const isOwner = ctx.user?.id === input.userId;
            if (!u || (!u.shareTrades && !isOwner)) return { visible: false as const, items: [], nextCursor: undefined };

            const rows = await db
                .select({
                    id: trades.id, userId: trades.userId, inputMint: trades.inputMint, outputMint: trades.outputMint,
                    usdValue: trades.usdValue, confirmedAt: trades.confirmedAt, source: trades.source,
                })
                .from(trades)
                .where(and(
                    eq(trades.userId, input.userId),
                    eq(trades.status, "confirmed"),
                    input.cursor ? lt(trades.confirmedAt, new Date(input.cursor)) : undefined,
                ))
                .orderBy(desc(trades.confirmedAt))
                .limit(input.limit + 1);
            const hasMore = rows.length > input.limit;
            const page = hasMore ? rows.slice(0, input.limit) : rows;
            return {
                visible: true as const,
                items: await shapeTrades(page),
                nextCursor: hasMore ? page[page.length - 1].confirmedAt?.toISOString() : undefined,
            };
        }),

    /** Global firehose of sharing users' confirmed trades (the fomo feed). */
    tradesFeed: publicProcedure
        .input(z.object({ limit: z.number().min(1).max(50).default(30) }).optional())
        .query(async ({ input }) => {
            const rows = await db
                .select({
                    id: trades.id, userId: trades.userId, inputMint: trades.inputMint, outputMint: trades.outputMint,
                    usdValue: trades.usdValue, confirmedAt: trades.confirmedAt, source: trades.source,
                    trader: { name: user.name, username: user.username, avatar_url: user.avatar_url, level: user.level },
                })
                .from(trades)
                .innerJoin(user, eq(trades.userId, user.id))
                .where(and(eq(trades.status, "confirmed"), eq(user.shareTrades, true)))
                .orderBy(desc(trades.confirmedAt))
                .limit(input?.limit ?? 30);
            const shaped = await shapeTrades(rows);
            const traderById = new Map(rows.map((r) => [r.id, r.trader]));
            return { items: shaped.map((s) => ({ ...s, trader: traderById.get(s.id)! })) };
        }),

    /** Opt in/out of public trades (notifications + card + leaderboard). */
    setSharing: protectedProcedure
        .input(z.object({ share: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await db.update(user).set({ shareTrades: input.share }).where(eq(user.id, ctx.user.id));
            // Keep the Helius user-trades webhook in step so external swaps
            // start/stop counting immediately (daily cron self-heals misses).
            try {
                const { syncUserTradesWebhook } = await import("@/lib/wallet/user-trades-webhook");
                await syncUserTradesWebhook();
            } catch { /* non-critical; daily sync recovers */ }
            return { shareTrades: input.share };
        }),
});
