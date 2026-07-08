import { router, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { streams } from "@/db/schema/content/stream";
import { user } from "@/db/schema/auth/user";
import { eq, and, desc, sql, isNotNull, type SQL } from "drizzle-orm";

/**
 * Trade discovery feed. Reads ONLY the cached market columns on `tokens`
 * (written by the token-stream worker), so the read path issues no RPC and
 * scales to many concurrent users. Drafts are excluded — live tokens only.
 */

const PER_COLUMN = 50;

function timeAgo(date: Date): string {
    const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

// Each feed row carries the token plus live-stream state for its creator, so
// the Discover "Live" tab (creator streaming right now) needs no extra query.
function feedQuery(where: SQL | undefined) {
    return db
        .select({
            token: tokens,
            creatorIsLive: streams.isLive,
            liveViewerCount: streams.viewerCount,
            creatorUsername: user.username,
        })
        .from(tokens)
        .leftJoin(streams, eq(streams.userId, tokens.creatorId))
        .leftJoin(user, eq(user.id, tokens.creatorId))
        .where(where);
}

type FeedRow = Awaited<ReturnType<typeof feedQuery>>[number];

function toTradeToken({ token: t, creatorIsLive, liveViewerCount, creatorUsername }: FeedRow) {
    return {
        id: t.id,
        name: t.name,
        symbol: t.ticker,
        imageUrl: t.imageUrl ?? "",
        platform: "meteora" as const,
        timeAgo: timeAgo(t.createdAt),
        hasSocials: {
            twitter: t.twitterUrl ?? undefined,
            website: t.websiteUrl ?? undefined,
        },
        priceUsd: t.priceUsd ?? 0,
        holderCount: t.holderCount ?? 0,
        txCount: t.txCount24h ?? 0,
        bondingProgress: Math.round(t.bondingProgress ?? 0),
        solAmount: 0,
        marketCap: t.marketCapUsd ?? 0,
        volume: t.volume24hUsd ?? 0,
        buyPercent: 0,
        sellPercent: 0,
        changePercent: t.priceChange24h ?? 0,
        status: t.phase,
        tokenAddress: t.tokenAddress,
        poolAddress: t.poolAddress,
        creatorIsLive: creatorIsLive ?? false,
        liveViewerCount: creatorIsLive ? (liveViewerCount ?? 0) : 0,
        creatorUsername,
    };
}

export const tradeRouter = router({
    getFeed: publicProcedure.query(async () => {
        // Live + has an on-chain pool (tradeable). Drafts and pool-less rows never show.
        const live = and(eq(tokens.status, "live"), isNotNull(tokens.poolAddress));

        const [newCol, migratingCol, migratedCol] = await Promise.all([
            feedQuery(and(live, eq(tokens.phase, "new")))
                .orderBy(desc(tokens.createdAt))
                .limit(PER_COLUMN),
            feedQuery(and(live, eq(tokens.phase, "migrating")))
                .orderBy(desc(tokens.bondingProgress))
                .limit(PER_COLUMN),
            feedQuery(and(live, eq(tokens.phase, "migrated")))
                .orderBy(sql`${tokens.volume24hUsd} desc nulls last`)
                .limit(PER_COLUMN),
        ]);

        return {
            new: newCol.map(toTradeToken),
            migrating: migratingCol.map(toTradeToken),
            migrated: migratedCol.map(toTradeToken),
        };
    }),
});
