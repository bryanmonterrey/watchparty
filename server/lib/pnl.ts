import { db } from "@/db";
import { trades, pnlSnapshots } from "@/db/schema/content";
import { nanoid } from "nanoid";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

/**
 * Realized-PnL computation from confirmed trades (docs/exp-callouts.md §4b).
 *
 * A trade counts when exactly one side is a cash mint (SOL/USDC/USDT): cash-in
 * = buy of the other mint, cash-out = sell. Per user × mint inside a window:
 * average cost per raw unit from buys, realized = proceeds − avgCost × qtySold.
 * Raw base units are consistent within a mint, so decimals cancel — no price
 * oracle needed. Unrealized PnL is deliberately out of scope until a decimals/
 * price layer exists.
 */

export const CASH_MINTS = new Set([
    "So11111111111111111111111111111111111111111", // SOL (internal id)
    "So11111111111111111111111111111111111111112", // wSOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

export const PNL_WINDOWS = { "24h": 24 * 3600e3, "7d": 7 * 24 * 3600e3, "30d": 30 * 24 * 3600e3 } as const;
export type PnlWindow = keyof typeof PNL_WINDOWS;

interface Position { boughtRaw: number; costUsd: number; soldRaw: number; proceedsUsd: number }

/** Recompute snapshots for every user with confirmed trades in the window. */
export async function computePnlSnapshots(window: PnlWindow): Promise<number> {
    const since = new Date(Date.now() - PNL_WINDOWS[window]);
    const rows = await db
        .select({
            userId: trades.userId,
            inputMint: trades.inputMint,
            outputMint: trades.outputMint,
            inAmountRaw: trades.inAmountRaw,
            outAmountRaw: trades.outAmountRaw,
            usdValue: trades.usdValue,
        })
        .from(trades)
        .where(and(eq(trades.status, "confirmed"), isNotNull(trades.usdValue), gte(trades.confirmedAt, since)));

    // user → mint → position
    const users = new Map<string, { positions: Map<string, Position>; volumeUsd: number; tradeCount: number }>();
    for (const t of rows) {
        const inCash = CASH_MINTS.has(t.inputMint);
        const outCash = CASH_MINTS.has(t.outputMint);
        if (inCash === outCash) continue; // cash↔cash or token↔token — no cash side to price
        const mint = inCash ? t.outputMint : t.inputMint;
        const u = users.get(t.userId) ?? { positions: new Map(), volumeUsd: 0, tradeCount: 0 };
        const p = u.positions.get(mint) ?? { boughtRaw: 0, costUsd: 0, soldRaw: 0, proceedsUsd: 0 };
        const usd = t.usdValue ?? 0;
        if (inCash) {
            p.boughtRaw += Number(t.outAmountRaw);
            p.costUsd += usd;
        } else {
            p.soldRaw += Number(t.inAmountRaw);
            p.proceedsUsd += usd;
        }
        u.positions.set(mint, p);
        u.volumeUsd += usd;
        u.tradeCount += 1;
        users.set(t.userId, u);
    }

    let written = 0;
    for (const [userId, u] of users) {
        let realizedUsd = 0;
        let closed = 0;
        let won = 0;
        for (const p of u.positions.values()) {
            if (p.soldRaw <= 0) continue;
            // Sells beyond window-tracked buys have no basis — count at zero cost
            // only up to what we saw bought; clamp so a partial window can't
            // fabricate cost for tokens bought before it.
            const matchedRaw = Math.min(p.soldRaw, p.boughtRaw);
            if (matchedRaw <= 0 || p.boughtRaw <= 0) continue;
            const avgCostPerRaw = p.costUsd / p.boughtRaw;
            const soldFraction = matchedRaw / p.soldRaw;
            const realized = p.proceedsUsd * soldFraction - avgCostPerRaw * matchedRaw;
            realizedUsd += realized;
            closed += 1;
            if (realized > 0) won += 1;
        }
        await db
            .insert(pnlSnapshots)
            .values({
                id: nanoid(),
                userId,
                window,
                realizedUsd,
                volumeUsd: u.volumeUsd,
                tradeCount: u.tradeCount,
                winRate: closed > 0 ? won / closed : null,
            })
            .onConflictDoUpdate({
                target: [pnlSnapshots.userId, pnlSnapshots.window],
                set: {
                    realizedUsd,
                    volumeUsd: u.volumeUsd,
                    tradeCount: u.tradeCount,
                    winRate: closed > 0 ? won / closed : null,
                    computedAt: sql`now()`,
                },
            });
        written++;
    }
    return written;
}
