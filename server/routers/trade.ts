import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { follows } from "@/db/schema/content/follow";
import { streams } from "@/db/schema/content/stream";
import { user } from "@/db/schema/auth/user";
import { eq, and, desc, sql, isNotNull, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withCache } from "@/lib/cache";
import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";
import { emitLaunchEvent } from "@/lib/coin-feed/emit";

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
    /**
     * The creator's most recent live token — the pin above live chat
     * (design brief §2). Cached 60s; null when the creator has no live token.
     */
    tokenByCreator: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(({ input }) =>
            withCache(`token:by-creator:${input.creatorId}`, 60, async () => {
                const [t] = await db
                    .select({
                        id: tokens.id,
                        // The mint. Its absence is what "not launched yet" means.
                        tokenAddress: tokens.tokenAddress,
                        ticker: tokens.ticker,
                        name: tokens.name,
                        imageUrl: tokens.imageUrl,
                        priceUsd: tokens.priceUsd,
                        marketCapUsd: tokens.marketCapUsd,
                        bondingProgress: tokens.bondingProgress,
                        phase: tokens.phase,
                    })
                    .from(tokens)
                    // Drafts included, so an unlaunched coin still shows with a
                    // Launch action — but live first, so a brand-new draft can
                    // never shadow the creator's established coin.
                    .where(eq(tokens.creatorId, input.creatorId))
                    .orderBy(sql`case when ${tokens.status} = 'live' then 0 else 1 end`, desc(tokens.createdAt))
                    .limit(1);
                return t ?? null;
            })
        ),

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
     * "Runners" — live coins pumping right now (biggest 24h gainers with real
     * volume). Powers the discover right-rail card. Cached 60s.
     */
    runners: publicProcedure
        .input(z.object({ limit: z.number().min(1).max(10).default(5) }).optional())
        .query(({ input }) => {
            const limit = input?.limit ?? 5;
            return withCache(`trade:runners:v1:${limit}`, 60, async () =>
                db
                    .select({
                        id: tokens.id,
                        tokenAddress: tokens.tokenAddress,
                        ticker: tokens.ticker,
                        name: tokens.name,
                        imageUrl: tokens.imageUrl,
                        priceUsd: tokens.priceUsd,
                        priceChange24h: tokens.priceChange24h,
                        marketCapUsd: tokens.marketCapUsd,
                        volume24hUsd: tokens.volume24hUsd,
                    })
                    .from(tokens)
                    .where(
                        and(
                            eq(tokens.status, "live"),
                            isNotNull(tokens.poolAddress),
                            sql`${tokens.priceChange24h} > 0`,
                            sql`${tokens.volume24hUsd} > 0`,
                        ),
                    )
                    .orderBy(sql`${tokens.priceChange24h} desc nulls last`)
                    .limit(limit),
            );
        }),

    /**
     * 24h-ago reference prices for the perps rail, one shared server-side
     * sweep instead of a per-ticker request from every browser (72 parallel
     * client fetches tripped Pyth benchmarks' rate limit and 429'd the
     * charts). Cached 10 min; fetched in small chunks to stay under the
     * limiter ourselves. Missing tickers just omit their key.
     */
    getPerpDayRefs: publicProcedure
        .input(z.object({ tickers: z.array(z.string().max(64)).max(100) }))
        .query(async ({ input }) => {
            const tickers = [...new Set(input.tickers)].sort();
            return withCache(`perps:dayrefs:v1:${tickers.length}`, 600, async () => {
                const to = Math.floor(Date.now() / 1000) - 23 * 3600;
                const from = to - 2 * 3600;
                const refs: Record<string, number> = {};
                for (let i = 0; i < tickers.length; i += 8) {
                    await Promise.all(tickers.slice(i, i + 8).map(async (ticker) => {
                        try {
                            const res = await fetch(
                                `https://benchmarks.pyth.network/v1/shims/tradingview/history` +
                                `?symbol=${encodeURIComponent(ticker)}&resolution=60&from=${from}&to=${to}`,
                            );
                            const d = (await res.json()) as { s: string; o: number[] };
                            if (d.s === "ok" && d.o.length) refs[ticker] = d.o[0];
                        } catch {
                            /* omit */
                        }
                    }));
                }
                return refs;
            });
        }),

    /**
     * $cashtag autocomplete: tickers matching what's been typed after the `$`.
     *
     * Ranking is prefix-first, then size. Someone typing "$ti" means a ticker
     * STARTING with "ti" far more often than one merely containing it, so an
     * exact-prefix hit outranks a substring hit; within each group the bigger
     * market cap wins, because that's the coin they're most likely to mean.
     *
     * publicProcedure — the composer is behind auth anyway, and a ticker list is
     * public information either way.
     */
    searchTickers: publicProcedure
        .input(z.object({ query: z.string().min(1).max(20), limit: z.number().min(1).max(10).default(6) }))
        .query(async ({ input }) => {
            const q = input.query.trim().replace(/^\$/, "").toLowerCase();
            if (!q) return [];

            // Escape LIKE wildcards so a user typing "%" doesn't match everything.
            const esc = q.replace(/[%_\\]/g, (c) => `\\${c}`);

            return db
                .select({
                    id: tokens.id,
                    ticker: tokens.ticker,
                    name: tokens.name,
                    imageUrl: tokens.imageUrl,
                    tokenAddress: tokens.tokenAddress,
                    priceUsd: tokens.priceUsd,
                    priceChange24h: tokens.priceChange24h,
                    marketCapUsd: tokens.marketCapUsd,
                    status: tokens.status,
                    // The row's third segment: ticker · VENUE · market cap ·
                    // contract. For a coin that's the chain it lives on; every
                    // token here is Solana and there's no chain column yet, so
                    // it's constant.
                    //
                    // TOKENIZED STOCKS put their exchange in this same slot
                    // ("NYSE", "NASDAQ") and carry no `chain`, so their rows
                    // render correctly with no UI change — the badge just
                    // doesn't draw.
                    venue: sql<string>`'Solana'`,
                    chain: sql<string>`'solana'`,
                })
                .from(tokens)
                // LIVE ONLY. A draft has no pool, no price and no contract
                // address — there is nothing to mention. Mentioning one would
                // also read as an endorsement of a coin that may never launch.
                .where(and(
                    eq(tokens.status, "live"),
                    sql`(lower(${tokens.ticker}) like ${esc + "%"} escape '\\'
                      or lower(${tokens.ticker}) like ${"%" + esc + "%"} escape '\\'
                      or lower(${tokens.name}) like ${esc + "%"} escape '\\')`,
                ))
                .orderBy(
                    sql`case when lower(${tokens.ticker}) like ${esc + "%"} escape '\\' then 0 else 1 end`,
                    sql`${tokens.marketCapUsd} desc nulls last`,
                )
                .limit(input.limit);
        }),

    /**
     * The caller's creator coin, plus whether they have one at all.
     * Public so a visitor's profile can show the coin; the OWNER check for
     * mutating it lives in the mutations below.
     */
    getCreatorCoin: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ input }) => {
            const [row] = await db
                .select()
                .from(tokens)
                .where(and(eq(tokens.creatorId, input.userId), eq(tokens.isCreatorCoin, true)))
                .limit(1);
            if (!row) return null;

            // A creator coin's art TRACKS the creator's avatar until it mints.
            //
            // It isn't stored on the draft at all (see createCreatorCoin), so
            // changing your picture changes the coin — which is what a coin
            // that represents a person should do. Launching freezes it: from
            // then on the row carries its own imageUrl and this resolves to
            // nothing, because the mint's metadata can't be edited and the app
            // must not disagree with it.
            if (row.imageUrl) return row;

            const [creator] = await db
                .select({ avatar: user.avatar_url })
                .from(user)
                .where(eq(user.id, input.userId))
                .limit(1);
            return { ...row, imageUrl: creator?.avatar ?? null };
        }),

    /**
     * Create the caller's creator coin.
     *
     * ONLY the creator may do this, and the rule is enforced here rather than by
     * hiding a button: a creator coin is minted against `ctx.user.id`, full
     * stop. There is no userId input to spoof — the identity IS the session.
     *
     * CREATING is creator-only; LAUNCHING is not. The split is deliberate:
     * authoring the coin — its ticker, name, fee — is what makes it represent a
     * person, and a stranger doing that would be impersonation. The first buy
     * is just a purchase of something the creator already authored, so it
     * follows the site-wide rule (`activateToken`): anyone can be the first
     * buyer, they get the first tokens, and the creator keeps the pool
     * identity and fees either way.
     *
     * One per creator, guaranteed by a partial unique index rather than this
     * pre-check alone — two concurrent calls would both pass the check, and the
     * index is what actually stops the second insert.
     */
    createCreatorCoin: protectedProcedure
        .input(z.object({
            ticker: z.string().min(1).max(16),
            name: z.string().max(64).optional(),
            description: z.string().max(500).optional(),
            imageUrl: z.string().optional(),
            creatorFeePercent: z.number().min(0).max(5).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const [existing] = await db
                .select({ id: tokens.id })
                .from(tokens)
                .where(and(eq(tokens.creatorId, ctx.user.id), eq(tokens.isCreatorCoin, true)))
                .limit(1);
            if (existing) {
                throw new TRPCError({ code: "CONFLICT", message: "You already have a creator coin" });
            }

            const id = nanoid();
            try {
                await db.insert(tokens).values({
                    id,
                    ticker: input.ticker.toUpperCase(),
                    name: input.name?.trim() || input.ticker.toUpperCase(),
                    description: input.description,
                    // Deliberately NOT defaulted to the avatar: a draft with no
                    // stored image is what lets getCreatorCoin resolve the
                    // creator's CURRENT one, so the coin tracks their picture
                    // until the launch freezes it.
                    imageUrl: input.imageUrl || undefined,
                    creatorFeePercent: input.creatorFeePercent,
                    status: "draft",
                    earningsEnabled: true,
                    creatorId: ctx.user.id,
                    isCreatorCoin: true,
                });
            } catch (e: any) {
                // The unique index fired — someone double-submitted.
                if (String(e?.message ?? "").includes("idx_tokens_one_creator_coin")) {
                    throw new TRPCError({ code: "CONFLICT", message: "You already have a creator coin" });
                }
                throw e;
            }

            return { id };
        }),

    /**
     * Edit the caller's creator coin while it's still a draft.
     *
     * Draft-only, and that's the whole point of the `status` guard: once the
     * coin is live the ticker, name and image are in on-chain metadata, so
     * changing the row here would just make the app disagree with the mint.
     * Creator-gated the same way as everything else on this coin — the WHERE
     * carries ctx.user.id, so there's no id to spoof.
     */
    updateCreatorCoin: protectedProcedure
        .input(z.object({
            ticker: z.string().min(1).max(16).optional(),
            name: z.string().max(64).optional(),
            description: z.string().max(500).optional(),
            imageUrl: z.string().optional(),
            creatorFeePercent: z.number().min(0).max(5).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const patch: Record<string, unknown> = {};
            if (input.ticker !== undefined) patch.ticker = input.ticker.trim().toUpperCase();
            if (input.name !== undefined) patch.name = input.name.trim() || undefined;
            if (input.description !== undefined) patch.description = input.description;
            if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
            if (input.creatorFeePercent !== undefined) patch.creatorFeePercent = input.creatorFeePercent;
            if (!Object.keys(patch).length) return { id: null };

            const updated = await db
                .update(tokens)
                .set(patch)
                .where(and(
                    eq(tokens.creatorId, ctx.user.id),
                    eq(tokens.isCreatorCoin, true),
                    eq(tokens.status, "draft"),
                ))
                .returning({ id: tokens.id });

            if (!updated.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "No draft creator coin to edit" });
            }
            return { id: updated[0].id };
        }),

    /**
     * Record a creator coin's on-chain launch.
     *
     * Guarded twice over: protectedProcedure for a session, and creatorId in the
     * WHERE so the row must belong to the caller. A non-creator's call matches
     * nothing and updates nothing rather than erroring loudly — the answer to
     * "may I launch someone else's identity coin" is simply no.
     */
    launchCreatorCoin: protectedProcedure
        .input(z.object({
            tokenAddress: z.string().min(32).max(44),
            poolAddress: z.string().min(32).max(44),
        }))
        .mutation(async ({ ctx, input }) => {
            const updated = await db
                .update(tokens)
                .set({
                    tokenAddress: input.tokenAddress,
                    poolAddress: input.poolAddress,
                    status: "live",
                    // Freeze the art. Up to now the draft stored none and the
                    // avatar was resolved on read; the mint has just baked one
                    // in permanently, so the row has to stop tracking and hold
                    // exactly what was minted.
                    imageUrl: sql`coalesce(${tokens.imageUrl}, ${ctx.user.avatar_url ?? null})`,
                })
                .where(and(
                    eq(tokens.creatorId, ctx.user.id),
                    eq(tokens.isCreatorCoin, true),
                    eq(tokens.status, "draft"),
                ))
                .returning({ id: tokens.id });

            if (!updated.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "No draft creator coin to launch" });
            }
            return { id: updated[0].id };
        }),

    /** Perps-rail Follows tab: live tokens from creators the caller follows. */
    getFollowedTokens: protectedProcedure.query(async ({ ctx }) => {
        return db
            .select({
                id: tokens.id,
                ticker: tokens.ticker,
                tokenAddress: tokens.tokenAddress,
                imageUrl: tokens.imageUrl,
                priceUsd: tokens.priceUsd,
                priceChange24h: tokens.priceChange24h,
            })
            .from(tokens)
            .innerJoin(follows, eq(follows.followingId, tokens.creatorId))
            .where(and(eq(follows.followerId, ctx.user.id), eq(tokens.status, "live"), isNotNull(tokens.poolAddress)))
            .orderBy(sql`${tokens.volume24hUsd} desc nulls last`)
            .limit(20);
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
                .select({
                    id: tokens.id,
                    status: tokens.status,
                    imageUrl: tokens.imageUrl,
                    isCreatorCoin: tokens.isCreatorCoin,
                    creatorId: tokens.creatorId,
                })
                .from(tokens)
                .where(eq(tokens.id, input.tokenId))
                .limit(1);
            if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Coin not found" });
            if (row.status === "live") return { activated: false, alreadyLive: true };

            // A creator coin's draft stores no art — getCreatorCoin resolves the
            // creator's avatar on read so the coin tracks their picture. The
            // mint is about to bake one in permanently, so freeze it here too:
            // read-time tracking must stop the moment it goes live, or the app
            // would drift away from the metadata the next time they change it.
            let frozenImage: string | null = null;
            if (row.isCreatorCoin && !row.imageUrl && row.creatorId) {
                const [creator] = await db
                    .select({ avatar: user.avatar_url })
                    .from(user)
                    .where(eq(user.id, row.creatorId))
                    .limit(1);
                frozenImage = creator?.avatar ?? null;
            }

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
                    ...(frozenImage ? { imageUrl: frozenImage } : {}),
                    updatedAt: new Date(),
                })
                .where(and(eq(tokens.id, input.tokenId), eq(tokens.status, "draft")))
                .returning({
                    id: tokens.id,
                    name: tokens.name,
                    ticker: tokens.ticker,
                    imageUrl: tokens.imageUrl,
                    creatorId: tokens.creatorId,
                });
            if (!updated) return { activated: false, alreadyLive: true };

            // Announce the launch in the /home coin alert rail. Market cap is
            // null here by definition — the first sync hasn't run yet.
            await emitLaunchEvent({
                token: {
                    wpTokenId: updated.id,
                    tokenAddress: input.tokenAddress,
                    ticker: updated.ticker,
                    imageUrl: updated.imageUrl,
                    marketCapUsd: null,
                },
                creatorId: updated.creatorId,
            });

            // Fire-and-forget: watch the pool for external trades + pull the
            // first market snapshot now.
            import("@/lib/tokens/trades-webhook")
                .then(({ syncTradesWebhook }) => syncTradesWebhook())
                .catch(() => {});
            import("@/lib/tokens/market-sync")
                .then(({ syncMarketData, syncCurveProgress }) => {
                    const syncable = [{
                        id: input.tokenId,
                        poolAddress: input.poolAddress,
                        phase: "new" as const,
                        tokenAddress: input.tokenAddress,
                        name: updated.name,
                        ticker: updated.ticker,
                        lastAlertPriceUsd: null,
                        lastAlertAt: null,
                    }];
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
    /** Record that the caller trades Drift perps with this wallet (upsert).
     *  Called after a successful deposit — feeds the perps referral sweep. */
    recordDriftAccount: protectedProcedure
        .input(z.object({ authority: z.string().min(32).max(44) }))
        .mutation(async ({ ctx, input }) => {
            const { driftAccounts } = await import("@/db/schema/content/token");
            await db
                .insert(driftAccounts)
                .values({ userId: ctx.user.id, authority: input.authority })
                .onConflictDoUpdate({ target: driftAccounts.userId, set: { authority: input.authority } });
            return { ok: true };
        }),

    syncToken: protectedProcedure
        .input(z.object({ mint: z.string().min(32).max(44) }))
        .mutation(async ({ input }) => {
            const [row] = await db
                .select({
                    id: tokens.id,
                    poolAddress: tokens.poolAddress,
                    phase: tokens.phase,
                    tokenAddress: tokens.tokenAddress,
                    name: tokens.name,
                    ticker: tokens.ticker,
                    lastAlertPriceUsd: tokens.lastAlertPriceUsd,
                    lastAlertAt: tokens.lastAlertAt,
                })
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
            const syncable = [{ ...row, poolAddress: row.poolAddress! }];
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
