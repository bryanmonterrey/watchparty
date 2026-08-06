import "server-only";

import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { coinIndex } from "@/db/schema/content/coin-index";
import { fetchTokenPairs, normalizeAddress } from "@/lib/coins/dexscreener";

/** What /coin/<address> needs to render a coin we did not launch. Deliberately
 *  the same shape the chart overlay takes, so one view serves both. */
export type ResolvedCoin = {
    id: string;
    network: string;
    tokenAddress: string;
    poolAddress: string;
    symbol: string;
    name: string | null;
    imageUrl: string | null;
    priceUsd: number | null;
    marketCapUsd: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    priceChange24h: number | null;
    buys24h: number | null;
    sells24h: number | null;
    txns24h: number | null;
};

const txns = (buys: number | null, sells: number | null) =>
    buys != null || sells != null ? (buys ?? 0) + (sells ?? 0) : null;

/**
 * Resolve ANY coin address, on any chain, to something the coin page can show.
 *
 * Four sources, cheapest first — the first three are ours, the fourth is the
 * only one that costs an upstream call:
 *
 *   1. `trending_coins`  — the board's rows, complete market snapshot.
 *   2. `tracked_tokens`  — everything the alert feed watches.
 *   3. `coin_index`      — coins someone resolved here before. This is what
 *                          makes an unknown coin a ONE-TIME cost rather than a
 *                          recurring one: an address's chain and deepest pool
 *                          don't change, so the answer is written down.
 *   4. Dexscreener       — anything else in the world, then written to (3).
 *
 * `network` narrows the search when the URL carries a chain, which is the only
 * case where an address is genuinely ambiguous — the same address can exist on
 * several chains.
 *
 * Returns null only when Dexscreener has never heard of the address either, at
 * which point the page really is a 404.
 */
export async function resolveCoin(raw: string, network?: string): Promise<ResolvedCoin | null> {
    // EVM addresses arrive checksummed from Dexscreener, from a copy/paste out
    // of Etherscan, or from a shared link — while every table here stores the
    // lower-case form GeckoTerminal gave us. Normalising the INPUT is what makes
    // /coin/0xC02aaA39… find the same row as /coin/0xc02aaa39…. Solana mints are
    // base58 and pass through untouched; see normalizeAddress.
    //
    // Both forms are still tried below: `id` columns are `${network}:${address}`
    // and a couple of older rows may have been written before this existed.
    const address = normalizeAddress(raw);

    // The URL's chain segment arrives in whatever vocabulary wrote the link —
    // the wallet registry says "ethereum"/"polygon"/"bnb", Dexscreener says
    // "ethereum"/"bsc", while every table here stores GeckoTerminal's slugs
    // ("eth", "polygon_pos", "bsc"). Normalise the INPUT so /coin/ethereum/0x…
    // and /coin/eth/0x… are the same page instead of the former 404ing.
    const NETWORK_ALIASES: Record<string, string> = {
        ethereum: "eth",
        polygon: "polygon_pos",
        matic: "polygon_pos",
        bnb: "bsc",
        avalanche: "avax",
        sui: "sui-network",
        sei: "sei-network",
    };
    network = network ? (NETWORK_ALIASES[network.toLowerCase()] ?? network.toLowerCase()) : undefined;

    const onNetwork = <T extends { network: unknown }>(col: T) =>
        network ? eq(col.network as never, network) : undefined;

    const trending = await db.query.trendingCoins.findFirst({
        where: and(
            or(
                eq(trendingCoins.tokenAddress, address),
                eq(trendingCoins.id, address),
                eq(trendingCoins.id, raw),
            ),
            onNetwork(trendingCoins),
        ),
    });
    if (trending) {
        return {
            id: trending.id,
            network: trending.network,
            tokenAddress: trending.tokenAddress,
            poolAddress: trending.poolAddress,
            symbol: trending.symbol,
            name: trending.name,
            imageUrl: trending.imageUrl,
            priceUsd: trending.priceUsd,
            marketCapUsd: trending.marketCapUsd,
            liquidityUsd: trending.liquidityUsd,
            volume24hUsd: trending.volume24hUsd,
            priceChange24h: trending.priceChange24h,
            buys24h: trending.buys24h,
            sells24h: trending.sells24h,
            txns24h: trending.txns24h,
        };
    }

    const tracked = await db.query.trackedTokens.findFirst({
        where: and(
            or(
                eq(trackedTokens.tokenAddress, address),
                eq(trackedTokens.id, address),
                eq(trackedTokens.id, raw),
            ),
            onNetwork(trackedTokens),
        ),
    });
    if (tracked) {
        // Same cached market columns as the board, minus the per-side txn
        // counts — those are a trending-only sync. They stay null and render as
        // em-dashes rather than being faked.
        return {
            id: tracked.id,
            network: tracked.network,
            tokenAddress: tracked.tokenAddress,
            poolAddress: tracked.poolAddress,
            symbol: tracked.symbol,
            name: tracked.name,
            imageUrl: tracked.imageUrl,
            priceUsd: tracked.priceUsd,
            marketCapUsd: tracked.marketCapUsd,
            liquidityUsd: tracked.liquidityUsd,
            volume24hUsd: tracked.volume24hUsd,
            priceChange24h: tracked.priceChange24h,
            buys24h: null,
            sells24h: null,
            txns24h: null,
        };
    }

    const indexed = await db.query.coinIndex.findFirst({
        where: and(
            or(
                eq(coinIndex.tokenAddress, address),
                eq(coinIndex.id, address),
                eq(coinIndex.id, raw),
            ),
            onNetwork(coinIndex),
        ),
    });
    if (indexed) {
        return {
            id: indexed.id,
            network: indexed.network,
            tokenAddress: indexed.tokenAddress,
            poolAddress: indexed.poolAddress,
            symbol: indexed.symbol,
            name: indexed.name,
            imageUrl: indexed.imageUrl,
            priceUsd: indexed.priceUsd,
            marketCapUsd: indexed.marketCapUsd,
            liquidityUsd: indexed.liquidityUsd,
            volume24hUsd: indexed.volume24hUsd,
            priceChange24h: indexed.priceChange24h,
            buys24h: indexed.buys24h,
            sells24h: indexed.sells24h,
            txns24h: txns(indexed.buys24h, indexed.sells24h),
        };
    }

    // Upstream. Dexscreener rather than GeckoTerminal: it answers a bare address
    // WITH the chain, and its limits are per-IP and in the hundreds/min, where
    // GT's free tier is ~30/min for the whole app and two per-minute crons
    // already draw on it. A page must not spend the alert feed's budget.
    const pairs = await fetchTokenPairs(address);
    const pair = network ? pairs.find((p) => p.network === network) : pairs[0];
    if (!pair) return null;

    const id = `${pair.network}:${pair.tokenAddress}`;

    // Write it down. Not fatal if it fails — the page can render from what we
    // already have in hand, and the next visit simply resolves again.
    try {
        await db
            .insert(coinIndex)
            .values({
                id,
                network: pair.network,
                tokenAddress: pair.tokenAddress,
                poolAddress: pair.poolAddress,
                dexId: pair.dexId,
                symbol: pair.symbol,
                name: pair.name,
                imageUrl: pair.imageUrl,
                priceUsd: pair.priceUsd,
                marketCapUsd: pair.marketCapUsd,
                liquidityUsd: pair.liquidityUsd,
                volume24hUsd: pair.volume24hUsd,
                priceChange24h: pair.priceChange24h,
                buys24h: pair.buys24h,
                sells24h: pair.sells24h,
                source: "dexscreener",
            })
            .onConflictDoUpdate({
                target: coinIndex.id,
                set: {
                    poolAddress: pair.poolAddress,
                    symbol: pair.symbol,
                    name: pair.name,
                    imageUrl: pair.imageUrl,
                    priceUsd: pair.priceUsd,
                    marketCapUsd: pair.marketCapUsd,
                    liquidityUsd: pair.liquidityUsd,
                    volume24hUsd: pair.volume24hUsd,
                    priceChange24h: pair.priceChange24h,
                    buys24h: pair.buys24h,
                    sells24h: pair.sells24h,
                    resolvedAt: new Date(),
                },
            });
    } catch {
        // index write failed — serve the coin anyway
    }

    return {
        id,
        network: pair.network,
        tokenAddress: pair.tokenAddress,
        poolAddress: pair.poolAddress,
        symbol: pair.symbol,
        name: pair.name,
        imageUrl: pair.imageUrl,
        priceUsd: pair.priceUsd,
        marketCapUsd: pair.marketCapUsd,
        liquidityUsd: pair.liquidityUsd,
        volume24hUsd: pair.volume24hUsd,
        priceChange24h: pair.priceChange24h,
        buys24h: pair.buys24h,
        sells24h: pair.sells24h,
        txns24h: txns(pair.buys24h, pair.sells24h),
    };
}
