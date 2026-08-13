import "server-only";

import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { and, eq, inArray } from "drizzle-orm";
import { clearsLiquidityFloor } from "@/lib/coin-feed/quality";

/**
 * Drop coins we have MEASURED as untradeable, from a list that carries no
 * liquidity figure of its own.
 *
 * ## Why a surface can need this
 *
 * `/trending` reads `trending_coins`, so it filters on liquidity in SQL. But
 * `/trade`'s chain board is a LIVE passthrough of Mobula's chain-wide pairs
 * endpoint — it never touches that table, and the pairs response carries no
 * dollar figure at all (its `liquidity` field is the non-dollar one:
 * 0.00000038 beside $80M of 24h volume). So that board had nothing to filter
 * on and showed everything.
 *
 * Found live 2026-08-13 by a user looking at their own feed: `Guidy` on solana
 * — $11,621,576 of 24h volume, 27 holders, **$0.08** of liquidity — and
 * `risky: false`, because `isRiskyHoldings` fails open when Mobula reports no
 * concentration stats. Nothing in the app could see it.
 *
 * ## Why it's cheap
 *
 * These are the SAME coins the trending screen already measures, so the figure
 * is sitting in `trending_coins`. This is one indexed read for the whole page,
 * not a per-coin fetch — and the caller runs it inside a cache window, so it is
 * one read per window rather than per viewer.
 *
 * ## Unknown passes
 *
 * `clearsLiquidityFloor` admits null, and that has to hold here too: a coin
 * this app has never measured is unmeasured, not empty. Rejecting unknowns
 * would empty a chain board the moment the screen falls behind — and would
 * delete SOL and ETH on the day it does.
 *
 * Never throws: a failed lookup leaves the list exactly as it arrived, which is
 * the behaviour this surface had before there was any gate at all.
 */
export async function dropMeasuredUntradeable<T extends { tokenAddress: string }>(
    network: string,
    rows: T[],
): Promise<T[]> {
    const addresses = rows.map((r) => r.tokenAddress).filter(Boolean);
    if (!addresses.length) return rows;

    let measured: Map<string, number | null>;
    try {
        const found = await db
            .select({
                tokenAddress: trendingCoins.tokenAddress,
                liquidityUsd: trendingCoins.liquidityUsd,
            })
            .from(trendingCoins)
            .where(and(
                eq(trendingCoins.network, network),
                inArray(trendingCoins.tokenAddress, addresses),
            ));
        measured = new Map(found.map((r) => [r.tokenAddress, r.liquidityUsd]));
    } catch (err) {
        console.warn(
            "[measured-liquidity] lookup failed:",
            err instanceof Error ? err.message : err,
        );
        return rows;
    }

    return rows.filter((r) => clearsLiquidityFloor(measured.get(r.tokenAddress)));
}
