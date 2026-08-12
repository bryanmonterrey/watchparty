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
import { clearsBrandBar, isRiskyHoldings } from "@/lib/coin-feed/quality";
import { isVerifiedMint, verifiedSolanaMints } from "@/lib/coins/verified-tokens";
import { collapseCopycats } from "@/lib/coins/collapse-copycats";

/** A board row older than this is stale data, not data. See the note in `list`. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Below this a coin is not tradeable, so it is not a listing.
 *
 * Measured 2026-08-12: 109 of 311 board rows — 35% — sat under $1,000 of
 * liquidity. Not a rounding artefact of a few dust pairs; a third of what the
 * board was showing could not absorb a $100 order without moving double digits.
 *
 * $1,000 is deliberately low. It is not a quality judgement — quality is what
 * the brand, ticker and holder gates are for — it only asserts that a row on a
 * TRADING surface should be something you can actually trade. Anything with
 * real interest clears it within minutes of launch.
 *
 * Env-tunable because the right floor depends on what the board is for, and
 * that is worth changing without a deploy.
 */
const MIN_BOARD_LIQUIDITY_USD = Number(process.env.TRENDING_MIN_LIQUIDITY_USD ?? 1_000) || 0;

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

        // ── Only rows the spam gate can actually judge ───────────────────────
        //
        // A GeckoTerminal-sourced row carries no holder data, and
        // `isRiskyHoldings` fails OPEN on nulls — deliberately, since treating
        // unknown as risky would empty every chain that lacks the numbers. The
        // consequence is that a GT row is unfilterable by definition: it renders
        // whatever it is. 217 of 503 rows were in that state.
        //
        // So the board serves only rows from a provider that supplies the
        // signals. That is a NARROWER board, on purpose — a coin nobody can
        // vet is worse than a coin nobody sees, on a surface people trade from.
        //
        // Env-overridable rather than hardcoded so this is reversible without a
        // deploy, and so a future provider can be added by name.
        const allowedSources = (process.env.TRENDING_SOURCES ?? "mobula")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (allowedSources.length && !allowedSources.includes("*")) {
            where.push(inArray(trendingCoins.source, allowedSources));
        }
        // Untradeable rows are not listings — see MIN_BOARD_LIQUIDITY_USD.
        // In SQL rather than after the page, so it does not eat the page size
        // the way the JS gates below necessarily do.
        if (MIN_BOARD_LIQUIDITY_USD > 0) {
            where.push(gte(trendingCoins.liquidityUsd, MIN_BOARD_LIQUIDITY_USD));
        }
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
                // Holder quality — null on GeckoTerminal-sourced rows, which
                // never carried it. `isRiskyHoldings` reads null as no-data.
                top10Pct: trendingCoins.top10Pct,
                devPct: trendingCoins.devPct,
                snipersPct: trendingCoins.snipersPct,
                insidersPct: trendingCoins.insidersPct,
                bundlersPct: trendingCoins.bundlersPct,
                holdersCount: trendingCoins.holdersCount,
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
        // ...and hide the structurally risky, which is the filter that actually
        // works. `clearsBrandBar` above is name matching, and name matching
        // cannot tell `preOPENAI` from `CBETH` ("Coinbase Wrapped Staked ETH")
        // — both hit the same brand term. Concentration can: a coin whose top
        // ten wallets hold 90% is a rug whatever it calls itself, and a real
        // wrapped asset never looks like that.
        //
        // This is what Photon's Memescope and Axiom's Pulse filter on, and both
        // ship it ACTIVE. `/trade` already did (as of b1a3c6a1); the board
        // could not, because GeckoTerminal never gave it the numbers.
        //
        // FAILS OPEN on nulls, deliberately: every GeckoTerminal-sourced row
        // has no holder data at all, and treating "unknown" as "risky" would
        // empty the board for every chain Mobula does not serve.
        // Canonical registry first — it is what makes the brand/ticker rules
        // safe to apply aggressively. Cached 6h, so this is not a per-request
        // fetch; empty on failure, which reads as "nothing is exempt" rather
        // than disabling the gate.
        const verified = await verifiedSolanaMints();

        const clean = items
            .filter((i) => clearsBrandBar(i.symbol, i.name, i.liquidityUsd, isVerifiedMint(verified, i.network, i.tokenAddress)))
            .filter((i) => !isRiskyHoldings(i));

        // ONE ROW PER COIN. Copycats relaunch the same symbol+name every few
        // minutes, and this board never collapsed them — the filter existed but
        // lived in components/trade/, so only /trade got it. Measured on the
        // live solana board: 36 rows for 6 actual coins, with XST alone taking
        // 10% of a 131-row board.
        //
        // AFTER the gates, not before: collapsing first could keep a spam copy
        // as the survivor and then hide it, losing the legitimate one behind it.
        const deduped = collapseCopycats(
            clean.map((i) => ({ ...i, volume: i.volume24hUsd ?? 0, marketCap: i.marketCapUsd ?? 0 })),
        );

        return {
            items: deduped.map((i) => ({ ...i, activity: activity.get(i.id) ?? null })),
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
