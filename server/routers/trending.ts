// Read side of the trending board (/trending) — the market-wide, every-chain
// coin table.
//
// Reads only the `trending_coins` cache, so a page load costs zero external
// API calls no matter how many people are on it. The one thing that makes this
// more than a DexScreener clone is `activity`: recent trader-cluster alerts
// joined per coin, so a row can say "88 traders bought · 4m ago" rather than
// just showing numbers.
import { z } from "zod";
import { router, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { coinFeedEvents } from "@/db/schema/content/coin-feed";
import { and, asc, desc, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { clearsBrandBar } from "@/lib/coin-feed/quality";

/** A board row older than this is stale data, not data. See the note in `list`. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Which window the % / volume columns describe. */
export const TIMEFRAMES = ["5m", "1h", "6h", "24h"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const SORT_KEYS = ["trending", "volume", "marketCap", "liquidity", "gainers", "losers", "new", "txns"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

// AnyPgColumn, not `typeof trendingCoins.priceChange24h`: drizzle encodes the
// COLUMN NAME in the type, so every other column is unassignable to it.
const CHANGE_COL: Record<Timeframe, AnyPgColumn> = {
    "5m": trendingCoins.priceChange5m,
    "1h": trendingCoins.priceChange1h,
    "6h": trendingCoins.priceChange6h,
    "24h": trendingCoins.priceChange24h,
};

const VOLUME_COL: Record<Timeframe, AnyPgColumn> = {
    "5m": trendingCoins.volume5mUsd,
    "1h": trendingCoins.volume1hUsd,
    "6h": trendingCoins.volume6hUsd,
    "24h": trendingCoins.volume24hUsd,
};

const listInput = z.object({
    chains: z.array(z.string().max(32)).max(40).optional(),
    sort: z.enum(SORT_KEYS).default("trending"),
    timeframe: z.enum(TIMEFRAMES).default("24h"),
    q: z.string().max(64).optional(),
    minLiquidityUsd: z.number().min(0).optional(),
    limit: z.number().min(1).max(100).default(50),
    /** The cursor IS an offset. The board is a ranked snapshot refreshed
     *  wholesale, so there's no stable keyset to page on — and it's bounded to
     *  a few hundred rows, which is exactly where offset paging is fine. Named
     *  `cursor` because that's the field tRPC's useInfiniteQuery drives. */
    cursor: z.number().min(0).max(2000).nullish(),
});

function orderBy(sort: SortKey, tf: Timeframe): SQL[] {
    const change = CHANGE_COL[tf];
    const volume = VOLUME_COL[tf];
    switch (sort) {
        case "trending":
            // GT's own per-chain rank first — it blends signals we can't
            // recompute from these columns — then volume so chains interleave
            // sensibly instead of listing chain-by-chain.
            return [sql`${trendingCoins.rank} asc nulls last`, sql`${volume} desc nulls last`];
        case "volume":
            return [sql`${volume} desc nulls last`];
        case "marketCap":
            return [sql`${trendingCoins.marketCapUsd} desc nulls last`];
        case "liquidity":
            return [sql`${trendingCoins.liquidityUsd} desc nulls last`];
        case "gainers":
            return [sql`${change} desc nulls last`];
        case "losers":
            return [sql`${change} asc nulls last`];
        case "new":
            return [sql`${trendingCoins.poolCreatedAt} desc nulls last`];
        case "txns":
            return [sql`${trendingCoins.txns24h} desc nulls last`];
    }
}

export const trendingRouter = router({
    list: publicProcedure.input(listInput).query(async ({ input }) => {
        const offset = input.cursor ?? 0;
        const where: SQL[] = [];
        // Never serve a row the sync has stopped refreshing.
        //
        // `trending_coins` is upserted per pass and NOTHING deletes from it —
        // `pruneCandles()` prunes candles, not this table. So a coin that falls
        // off the board keeps its last-known price, volume and change forever,
        // and the board renders those as if they were current. Found a `blast`
        // row 22,021 minutes (15 days) old still being served.
        //
        // Filtering at READ rather than deleting: the row is still useful
        // history, and a network whose fetch is failing should vanish from the
        // board rather than lie — silence is the honest failure here.
        //
        // Six hours is deliberately generous. A full rotation covers every
        // network in minutes, so healthy rows are always far inside it; this
        // only has to survive a run of failed passes without emptying the board.
        where.push(gte(trendingCoins.fetchedAt, new Date(Date.now() - STALE_AFTER_MS)));
        if (input.chains?.length) where.push(inArray(trendingCoins.network, input.chains));
        if (input.minLiquidityUsd) where.push(gte(trendingCoins.liquidityUsd, input.minLiquidityUsd));
        if (input.q?.trim()) {
            // Symbol or name; the leading $ people type for tickers is stripped.
            const term = `%${input.q.trim().replace(/^\$/, "")}%`;
            where.push(or(ilike(trendingCoins.symbol, term), ilike(trendingCoins.name, term))!);
        }

        const rows = await db
            .select({
                id: trendingCoins.id,
                network: trendingCoins.network,
                tokenAddress: trendingCoins.tokenAddress,
                poolAddress: trendingCoins.poolAddress,
                dexId: trendingCoins.dexId,
                symbol: trendingCoins.symbol,
                name: trendingCoins.name,
                imageUrl: trendingCoins.imageUrl,
                priceUsd: trendingCoins.priceUsd,
                marketCapUsd: trendingCoins.marketCapUsd,
                liquidityUsd: trendingCoins.liquidityUsd,
                volume5mUsd: trendingCoins.volume5mUsd,
                volume1hUsd: trendingCoins.volume1hUsd,
                volume6hUsd: trendingCoins.volume6hUsd,
                volume24hUsd: trendingCoins.volume24hUsd,
                priceChange5m: trendingCoins.priceChange5m,
                priceChange1h: trendingCoins.priceChange1h,
                priceChange6h: trendingCoins.priceChange6h,
                priceChange24h: trendingCoins.priceChange24h,
                buys24h: trendingCoins.buys24h,
                sells24h: trendingCoins.sells24h,
                txns24h: trendingCoins.txns24h,
                poolCreatedAt: trendingCoins.poolCreatedAt,
                rank: trendingCoins.rank,
                fetchedAt: trendingCoins.fetchedAt,
            })
            .from(trendingCoins)
            .where(where.length ? and(...where) : undefined)
            .orderBy(...orderBy(input.sort, input.timeframe), asc(trendingCoins.id))
            .limit(input.limit + 1)
            .offset(offset);

        const hasMore = rows.length > input.limit;
        const items = hasMore ? rows.slice(0, input.limit) : rows;

        // ── The differentiator ────────────────────────────────────────────────
        // Attach the most recent trader-cluster alert per coin, so the board
        // shows live crowd behaviour and not just a price delta. One extra
        // query for the whole page (DISTINCT ON), not one per row.
        const ids = items.map((i) => i.id);
        let activity = new Map<string, { kind: string; traderCount: number | null; usdValue: number | null; occurredAt: Date }>();
        if (ids.length > 0) {
            const recent = await db
                .selectDistinctOn([coinFeedEvents.trackedTokenId], {
                    trackedTokenId: coinFeedEvents.trackedTokenId,
                    kind: coinFeedEvents.kind,
                    traderCount: coinFeedEvents.traderCount,
                    usdValue: coinFeedEvents.usdValue,
                    occurredAt: coinFeedEvents.occurredAt,
                })
                .from(coinFeedEvents)
                .where(
                    and(
                        inArray(coinFeedEvents.trackedTokenId, ids),
                        inArray(coinFeedEvents.kind, ["cluster_buy", "cluster_sell", "whale_buy", "whale_sell"]),
                    ),
                )
                .orderBy(coinFeedEvents.trackedTokenId, desc(coinFeedEvents.occurredAt));

            activity = new Map(
                recent
                    .filter((r) => r.trackedTokenId)
                    .map((r) => [r.trackedTokenId!, { kind: r.kind, traderCount: r.traderCount, usdValue: r.usdValue, occurredAt: r.occurredAt }]),
            );
        }

        // HIDE BRAND SQUATS. The board had NO quality gate of any kind.
        //
        // `clearsBrandBar` ran only in discovery's `qualifies()`, which decides
        // adoption into `tracked_tokens` — the alert rail. This table is fed
        // straight from GeckoTerminal by `trending-sync`, which filters
        // nothing, so every impersonator on the chain rendered here.
        //
        // Measured 2026-08-12 on the top 60 by 24h volume: TEN were
        // impersonators — GOOGLE, SNDK, NVDA, OPENAI, SPACEX, SPCXB, Grok BOT,
        // MARIO64, ELONCOIN, BNBSHIB — and SIX of those were already known to
        // `isBrandSquat`. They were visible not because the rules missed them
        // but because nothing ever asked.
        //
        // Filtered here rather than in `trending-sync` so a rule change takes
        // effect immediately instead of on the next sync, and so the row
        // survives for a future "show everything" toggle — the same reasoning
        // as the freshness filter above.
        //
        // In JS, not SQL: `clearsBrandBar` is the ONE definition of this, and
        // restating its two lists as a Postgres regex is precisely how the two
        // copies drift apart. Filtering after the page means a page can return
        // slightly fewer than `limit` rows; it never SKIPS one, because the
        // cursor still advances by `limit`. Same trade `screenSecurity` makes.
        const clean = items.filter((i) => clearsBrandBar(i.symbol, i.name, i.liquidityUsd));

        return {
            items: clean.map((i) => ({ ...i, activity: activity.get(i.id) ?? null })),
            nextCursor: hasMore ? offset + input.limit : null,
        };
    }),

    /** Chains on the board with their coin counts — drives the chain filter. */
    chains: publicProcedure.query(async () => {
        return db
            .select({ network: trendingCoins.network, coins: sql<number>`count(*)::int` })
            .from(trendingCoins)
            .groupBy(trendingCoins.network)
            .orderBy(sql`count(*) desc`);
    }),

    /** Headline numbers for the board's summary strip. */
    stats: publicProcedure.query(async () => {
        const [row] = await db
            .select({
                coins: sql<number>`count(*)::int`,
                chains: sql<number>`count(distinct ${trendingCoins.network})::int`,
                volume24hUsd: sql<number>`coalesce(sum(${trendingCoins.volume24hUsd}), 0)`,
                gainers: sql<number>`count(*) filter (where ${trendingCoins.priceChange24h} > 0)::int`,
                losers: sql<number>`count(*) filter (where ${trendingCoins.priceChange24h} < 0)::int`,
                lastSync: sql<Date | null>`max(${trendingCoins.fetchedAt})`,
            })
            .from(trendingCoins);
        return row ?? { coins: 0, chains: 0, volume24hUsd: 0, gainers: 0, losers: 0, lastSync: null };
    }),
});
