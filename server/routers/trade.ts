import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { streams } from "@/db/schema/content/stream";
import { user } from "@/db/schema/auth/user";
import { eq, and, desc, sql, isNotNull, type SQL } from "drizzle-orm";
import { withCache } from "@/lib/cache";
import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";

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
        changePercent5m: t.priceChange5m,
        changePercent1h: t.priceChange1h,
        changePercent6h: t.priceChange6h,
        volume5m: t.volume5mUsd,
        volume1h: t.volume1hUsd,
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

    /**
     * Flip a draft token live after a first buy launched it on-chain. ANYONE
     * can be the first buyer of a draft (the buy IS the launch), so this is
     * not creator-gated — instead we verify the pool actually exists on-chain
     * and its base mint matches before trusting the addresses. The draft
     * guard (status='draft' in the WHERE) makes concurrent launches
     * first-writer-wins.
     */
    activateToken: protectedProcedure
        .input(z.object({
            tokenId: z.string().min(1),
            tokenAddress: z.string().min(32).max(44),
            poolAddress: z.string().min(32).max(44),
        }))
        .mutation(async ({ input }) => {
            const [row] = await db
                .select({ id: tokens.id, status: tokens.status })
                .from(tokens)
                .where(eq(tokens.id, input.tokenId))
                .limit(1);
            if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Token not found" });
            if (row.status === "live") return { activated: false, alreadyLive: true };

            // On-chain proof: the pool must exist and be for this mint.
            const [{ DynamicBondingCurveClient }, { Connection }] = await Promise.all([
                import("@meteora-ag/dynamic-bonding-curve-sdk"),
                import("@solana/web3.js"),
            ]);
            const client = new DynamicBondingCurveClient(new Connection(getRpcUrl()), "confirmed");
            const pool = await client.state.getPool(input.poolAddress).catch(() => null);
            const baseMint = (pool as unknown as { poolState?: { baseMint?: { toBase58(): string } } })?.poolState?.baseMint
                ?? (pool as unknown as { baseMint?: { toBase58(): string } })?.baseMint;
            if (!pool || baseMint?.toBase58() !== input.tokenAddress) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Pool not found on-chain for that mint yet — wait a moment and retry" });
            }

            const [updated] = await db
                .update(tokens)
                .set({
                    tokenAddress: input.tokenAddress,
                    poolAddress: input.poolAddress,
                    status: "live",
                    phase: "new",
                    updatedAt: new Date(),
                })
                .where(and(eq(tokens.id, input.tokenId), eq(tokens.status, "draft")))
                .returning({ id: tokens.id });
            if (!updated) return { activated: false, alreadyLive: true };

            // Fire-and-forget: watch the pool for external trades + pull the
            // first market snapshot now.
            import("@/lib/tokens/trades-webhook")
                .then(({ syncTradesWebhook }) => syncTradesWebhook())
                .catch(() => {});
            import("@/lib/tokens/market-sync")
                .then(({ syncMarketData, syncCurveProgress }) => {
                    const syncable = [{ id: input.tokenId, poolAddress: input.poolAddress, phase: "new" as const }];
                    return Promise.all([syncMarketData(syncable), syncCurveProgress(syncable)]);
                })
                .catch(() => {});

            return { activated: true };
        }),

    /**
     * Event-driven market refresh: called fire-and-forget after an in-app
     * swap so THAT token's price/volume/curve update immediately instead of
     * waiting for the minute sweep. Throttled per mint (10s) — spam no-ops.
     */
    syncToken: protectedProcedure
        .input(z.object({ mint: z.string().min(32).max(44) }))
        .mutation(async ({ input }) => {
            const [row] = await db
                .select({ id: tokens.id, poolAddress: tokens.poolAddress, phase: tokens.phase })
                .from(tokens)
                .where(and(eq(tokens.tokenAddress, input.mint), isNotNull(tokens.poolAddress)))
                .limit(1);
            if (!row) return { synced: false };

            // Throttle: stamp a unique claim into the cache. Getting back a
            // DIFFERENT claim means another call synced within the window.
            // Keyed on token id — shared with the Helius trades webhook so
            // the two paths dedupe each other.
            const claim = `${Date.now()}:${Math.random()}`;
            const winner = await withCache(`token:sync-req:${row.id}`, 10, async () => claim);
            if (winner !== claim) return { synced: false };

            const { syncMarketData, syncCurveProgress } = await import("@/lib/tokens/market-sync");
            const syncable = [{ id: row.id, poolAddress: row.poolAddress!, phase: row.phase }];
            await syncMarketData(syncable);
            await syncCurveProgress(syncable);
            return { synced: true };
        }),

    /**
     * Top holders for a token page. Helius DAS getTokenAccounts returns
     * owner+amount per token account; we aggregate per owner and express
     * shares against on-chain supply. Cached 60s — holder churn is slow.
     */
    getHolders: publicProcedure
        .input(z.object({ mint: z.string().min(32).max(44) }))
        .query(async ({ input }) => {
            const heliusKey = process.env.HELIUS_API_KEY;
            if (!heliusKey) return { holders: [], supply: 0 };
            const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
            const post = (id: string, body: object) =>
                fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: AbortSignal.timeout(10000),
                    body: JSON.stringify({ jsonrpc: "2.0", id, ...body }),
                }).then((r) => r.json()).catch(() => ({ result: null }));

            return withCache(`token:holders:${input.mint}`, 60, async () => {
                const [accountsRes, supplyRes] = await Promise.all([
                    post("holders", { method: "getTokenAccounts", params: { mint: input.mint, limit: 1000 } }),
                    post("supply", { method: "getTokenSupply", params: [input.mint] }),
                ]);

                const accounts: { owner?: string; amount?: number }[] =
                    accountsRes?.result?.token_accounts ?? [];
                const supplyRaw = Number(supplyRes?.result?.value?.amount ?? 0);
                const decimals = Number(supplyRes?.result?.value?.decimals ?? 0);

                const byOwner = new Map<string, number>();
                for (const a of accounts) {
                    if (!a.owner) continue;
                    byOwner.set(a.owner, (byOwner.get(a.owner) ?? 0) + Number(a.amount ?? 0));
                }

                const holders = [...byOwner.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 20)
                    .map(([owner, raw]) => ({
                        owner,
                        amount: decimals ? raw / 10 ** decimals : raw,
                        sharePercent: supplyRaw > 0 ? (raw / supplyRaw) * 100 : 0,
                    }));

                return { holders, supply: decimals ? supplyRaw / 10 ** decimals : supplyRaw };
            });
        }),
});
