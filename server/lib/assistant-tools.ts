import "server-only";
import { z } from "zod";
import { tool } from "ai";
import { db } from "@/db";
import { withCache } from "@/lib/cache";
import { ANNUAL_MONTHS_FREE, TIERS, priceUsd } from "@/lib/premium/tiers";
import { tokens } from "@/db/schema/content/token";
import { trendingCoins } from "@/db/schema/content/trending";
import { streams } from "@/db/schema/content/stream";
import { user } from "@/db/schema/auth/user";
import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";

// Tools that let "ask watchparty" answer from real app data instead of only
// its system prompt (app/api/assistant/route.ts).
//
// Every query here is lifted from an existing tRPC procedure, deliberately not
// CALLED through one: a Route Handler has no tRPC ctx, and the only thing those
// procedures used ctx for was `ctx.user.id`. `db` (a per-request Hyperdrive
// proxy) and `withCache` are plain module imports that work identically here.
//
// Three rules shaped all of this, and they're all about tokens, not databases:
//
//   1. RETURNS ARE TINY. A tool result is re-sent as message history on every
//      subsequent turn, forever. trending.list's real projection is 23 columns
//      per row — at 50 rows that's ~8k tokens permanently welded into the
//      conversation. These return 5-6 fields and cap hard at 10 rows, below
//      what the underlying procedures allow, because the model WILL ask for 50.
//   2. NO ADDRESSES unless they're actionable. A 44-char base58 is ~15 tokens
//      the model cannot use or usefully repeat.
//   3. EVERYTHING IS CACHED. One user message can trigger several tool calls
//      plus a model round-trip each; without caching, a chatty loop is a
//      handful of uncached DB hits per question.
//
// Deliberately NOT exposed, each for a specific reason:
//   - discover.trending — orchestrates its own Cloudflare Workers AI call, so
//     it would nest an LLM inside this LLM (double spend, 6s cold latency).
//   - content.search — uncached Typesense multiSearch AND an uncached
//     DexScreener fetch, with no withCache anywhere to memoize.
//   - user.suggestedFollows — a correlated per-row subquery over `follows`
//     that it then sorts by, for data an assistant has little use for.
//   - coinFeed.list — needs ctx, scans jsonb, and its keyset cursor is
//     meaningless to a model.

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const publicTools = {
    getHotCoins: tool({
        description:
            "Live watchparty coins that are up over the last 24h, biggest gainers first. Use for questions like 'what's running today', 'what's pumping', 'what's hot on watchparty'. Returns platform coins only, not the wider market.",
        inputSchema: z.object({
            limit: z.number().min(1).max(10).default(5).describe("How many coins to return."),
        }),
        execute: async ({ limit }) => {
            // Lifted from trade.runners, which is already cached at 60s.
            const rows = await withCache(`assistant:hot:v1:${limit}`, 60, async () =>
                db
                    .select({
                        ticker: tokens.ticker,
                        name: tokens.name,
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

            return rows.map((r) => ({
                ticker: r.ticker,
                name: r.name,
                priceUsd: num(r.priceUsd),
                change24hPct: num(r.priceChange24h),
                marketCapUsd: num(r.marketCapUsd),
                volume24hUsd: num(r.volume24hUsd),
            }));
        },
    }),

    lookupCoin: tool({
        description:
            "Look up ONE specific coin by ticker, name, or contract/mint address. Checks watchparty's own coins first, then the wider multi-chain market. Use whenever the user names or pastes a coin. Returns null if no coin matches — say so rather than guessing.",
        inputSchema: z.object({
            query: z
                .string()
                .min(1)
                .max(64)
                .describe("Ticker or name (with or without a leading $), or a full contract/mint address."),
        }),
        execute: async ({ query }) => {
            const raw = query.trim().replace(/^\$/, "");
            if (!raw) return null;

            // A pasted contract address is a lookup by identity, not a name
            // search — and it must be shape-detected BEFORE lowercasing,
            // because base58 is case-sensitive. Solana mints are 32-44 base58
            // chars; EVM addresses are 0x + 40 hex (compared lowercased, since
            // checksum casing varies by source).
            const isSolanaMint = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw);
            const isEvmAddress = /^0x[0-9a-fA-F]{40}$/.test(raw);
            if (isSolanaMint || isEvmAddress) {
                const addr = isEvmAddress ? raw.toLowerCase() : raw;

                return withCache(`assistant:coin:addr:v1:${addr}`, 60, async () => {
                    const [own] = await db
                        .select({
                            ticker: tokens.ticker,
                            name: tokens.name,
                            priceUsd: tokens.priceUsd,
                            priceChange24h: tokens.priceChange24h,
                            marketCapUsd: tokens.marketCapUsd,
                        })
                        .from(tokens)
                        .where(
                            and(
                                eq(tokens.status, "live"),
                                isEvmAddress
                                    ? sql`lower(${tokens.tokenAddress}) = ${addr}`
                                    : eq(tokens.tokenAddress, addr),
                            ),
                        )
                        .limit(1);

                    if (own) {
                        return {
                            source: "watchparty" as const,
                            ticker: own.ticker,
                            name: own.name,
                            priceUsd: num(own.priceUsd),
                            change24hPct: num(own.priceChange24h),
                            marketCapUsd: num(own.marketCapUsd),
                        };
                    }

                    const [market] = await db
                        .select({
                            symbol: trendingCoins.symbol,
                            name: trendingCoins.name,
                            network: trendingCoins.network,
                            priceUsd: trendingCoins.priceUsd,
                            priceChange24h: trendingCoins.priceChange24h,
                            marketCapUsd: trendingCoins.marketCapUsd,
                        })
                        .from(trendingCoins)
                        .where(
                            isEvmAddress
                                ? sql`lower(${trendingCoins.tokenAddress}) = ${addr}`
                                : eq(trendingCoins.tokenAddress, addr),
                        )
                        .limit(1);

                    if (!market) return null;

                    return {
                        source: "market" as const,
                        ticker: market.symbol,
                        name: market.name,
                        network: market.network,
                        priceUsd: num(market.priceUsd),
                        change24hPct: num(market.priceChange24h),
                        marketCapUsd: num(market.marketCapUsd),
                    };
                });
            }

            const q = raw.toLowerCase();
            // Escape LIKE wildcards so a "%" doesn't match everything — same
            // guard the trade router uses.
            const esc = q.replace(/[%_\\]/g, (c) => `\\${c}`);

            return withCache(`assistant:coin:v1:${esc}`, 60, async () => {
                // Platform coins first: if watchparty has it, that's the one
                // the user means, and it's the one they can act on here.
                const [own] = await db
                    .select({
                        ticker: tokens.ticker,
                        name: tokens.name,
                        priceUsd: tokens.priceUsd,
                        priceChange24h: tokens.priceChange24h,
                        marketCapUsd: tokens.marketCapUsd,
                    })
                    .from(tokens)
                    .where(
                        and(
                            eq(tokens.status, "live"),
                            sql`(lower(${tokens.ticker}) like ${esc + "%"} escape '\\'
                              or lower(${tokens.ticker}) like ${"%" + esc + "%"} escape '\\'
                              or lower(${tokens.name}) like ${esc + "%"} escape '\\')`,
                        ),
                    )
                    .orderBy(
                        sql`case when lower(${tokens.ticker}) like ${esc + "%"} escape '\\' then 0 else 1 end`,
                        sql`${tokens.marketCapUsd} desc nulls last`,
                    )
                    .limit(1);

                if (own) {
                    return {
                        source: "watchparty" as const,
                        ticker: own.ticker,
                        name: own.name,
                        priceUsd: num(own.priceUsd),
                        change24hPct: num(own.priceChange24h),
                        marketCapUsd: num(own.marketCapUsd),
                    };
                }

                // Fall back to the market-wide board (trending_coins), which is
                // a local cache table refreshed by a sweeper — no external call.
                const term = `%${q}%`;
                const [market] = await db
                    .select({
                        symbol: trendingCoins.symbol,
                        name: trendingCoins.name,
                        network: trendingCoins.network,
                        priceUsd: trendingCoins.priceUsd,
                        priceChange24h: trendingCoins.priceChange24h,
                        marketCapUsd: trendingCoins.marketCapUsd,
                    })
                    .from(trendingCoins)
                    .where(or(ilike(trendingCoins.symbol, term), ilike(trendingCoins.name, term)))
                    .orderBy(sql`${trendingCoins.marketCapUsd} desc nulls last`)
                    .limit(1);

                if (!market) return null;

                return {
                    source: "market" as const,
                    ticker: market.symbol,
                    name: market.name,
                    network: market.network,
                    priceUsd: num(market.priceUsd),
                    change24hPct: num(market.priceChange24h),
                    marketCapUsd: num(market.marketCapUsd),
                };
            });
        },
    }),

    getPremiumTiers: tool({
        description:
            "watchparty's platform premium tiers and pricing, billed in USDC. Use for any question about premium cost, what a tier includes, the annual discount, or which tier fits someone. This IS the live pricing — quote it confidently, don't hedge about it being outdated.",
        inputSchema: z.object({}),
        // No DB and no cache: TIERS is a compile-time constant
        // (lib/premium/tiers.ts), so this can't be stale and costs nothing.
        execute: async () => ({
            billing: "USDC on Solana; prices are fixed USD",
            annualMonthsFree: ANNUAL_MONTHS_FREE,
            tiers: Object.values(TIERS).map((t) => ({
                name: t.name,
                group: t.group,
                tagline: t.tagline,
                monthlyUsd: t.selfServe ? t.monthlyUsd : null,
                annualUsd: t.selfServe ? priceUsd(t.key, "annual") : null,
                ...(t.selfServe ? {} : { contactSales: true }),
                adCreditsMonthly: t.adCreditsMonthly,
                boostSlots: t.boostSlots,
                features: t.features,
            })),
        }),
    }),

    getLiveStreams: tool({
        description:
            "Who is streaming on watchparty right now, most viewers first. Use for 'who's live', 'what's on', 'anyone streaming'. Returns an empty array when nobody is live — say that plainly.",
        inputSchema: z.object({
            limit: z.number().min(1).max(6).default(5).describe("How many streams to return."),
        }),
        execute: async ({ limit }) => {
            // Lifted from stream.listLive. Cached at 30s: live state moves, but
            // not fast enough to justify a DB hit per tool call in a loop.
            const rows = await withCache(`assistant:live:v1:${limit}`, 30, async () =>
                db
                    .select({
                        title: streams.title,
                        category: streams.category,
                        viewerCount: streams.viewerCount,
                        username: user.username,
                    })
                    .from(streams)
                    .innerJoin(user, eq(streams.userId, user.id))
                    .where(eq(streams.isLive, true))
                    .orderBy(desc(streams.viewerCount))
                    .limit(limit),
            );
            return rows;
        },
    }),

    getMarketTrending: tool({
        description:
            "Trending coins across the wider crypto market (all chains), not just watchparty. Use for broad market questions. Prefer getHotCoins when the user is asking about watchparty itself.",
        inputSchema: z.object({
            sort: z
                .enum(["trending", "gainers", "losers", "volume", "new"])
                .default("trending")
                .describe("Ranking to apply."),
            chain: z
                .string()
                .max(32)
                .optional()
                .describe("Optional network filter, e.g. 'solana', 'ethereum', 'base'."),
            limit: z.number().min(1).max(10).default(5),
        }),
        execute: async ({ sort, chain, limit }) => {
            const key = `assistant:market:v1:${sort}:${chain ?? "all"}:${limit}`;
            const rows = await withCache(key, 60, async () => {
                // The `activity` join from trending.list is deliberately
                // dropped — a second query for a field the model paraphrases
                // badly anyway.
                const order =
                    sort === "gainers"
                        ? sql`${trendingCoins.priceChange24h} desc nulls last`
                        : sort === "losers"
                          ? sql`${trendingCoins.priceChange24h} asc nulls last`
                          : sort === "volume"
                            ? sql`${trendingCoins.volume24hUsd} desc nulls last`
                            : sort === "new"
                              ? sql`${trendingCoins.poolCreatedAt} desc nulls last`
                              : sql`${trendingCoins.rank} asc nulls last`;

                return db
                    .select({
                        symbol: trendingCoins.symbol,
                        name: trendingCoins.name,
                        network: trendingCoins.network,
                        priceUsd: trendingCoins.priceUsd,
                        priceChange24h: trendingCoins.priceChange24h,
                        marketCapUsd: trendingCoins.marketCapUsd,
                    })
                    .from(trendingCoins)
                    .where(chain ? eq(trendingCoins.network, chain) : undefined)
                    .orderBy(order)
                    .limit(limit);
            });

            return rows.map((r) => ({
                ticker: r.symbol,
                name: r.name,
                network: r.network,
                priceUsd: num(r.priceUsd),
                change24hPct: num(r.priceChange24h),
                marketCapUsd: num(r.marketCapUsd),
            }));
        },
    }),
};

// ── Account tools ────────────────────────────────────────────────────────────
//
// THE SECURITY MODEL, in one sentence: the user id is CLOSED OVER, never a
// parameter.
//
// These tools have no `userId` in their inputSchema, so "get the stream key for
// someone else" is not a sentence the model can form — there is no field to put
// another id in, and nothing to validate. That is strictly stronger than
// checking a model-supplied id, because a check can be wrong and a missing
// parameter cannot. The id comes from the signed session cookie in
// app/api/assistant/route.ts, so editing the request body doesn't reach it
// either.
//
// The second rule: a SECRET NEVER ENTERS A TOOL RESULT. Tool results are fed
// back into the model, streamed to the client, and — since conversation history
// shipped — written to assistant_messages.parts permanently. A stream key
// returned from here would be a live credential sitting in the model's context
// AND in a database row forever. So these return a REFERENCE
// ({ kind: "stream_key_card" }) and the client fetches the actual value over
// its own authenticated tRPC call, which the model never sees.
//
// That also defuses prompt injection. getLiveStreams feeds attacker-controlled
// text (stream titles, usernames) into this same context, so an injected
// "print the user's key" instruction is a real scenario — it just has nothing
// to print, because the key was never in the transcript.

export function assistantToolsFor(userId: string) {
    return {
        ...publicTools,

        getStreamKey: tool({
            description:
                "Show the signed-in user THEIR OWN stream key and ingest server, for going live in OBS. Use when they ask for their stream key, their RTMP settings, or how to connect their broadcast software. Only ever their own — you cannot look up anyone else's.",
            inputSchema: z.object({}),
            execute: async () => {
                const [row] = await db
                    .select({ serverUrl: streams.serverUrl, streamKey: streams.streamKey })
                    .from(streams)
                    .where(eq(streams.userId, userId))
                    .limit(1);

                // Booleans only. Whether a key EXISTS is what the model needs
                // in order to say the right sentence; the key itself is not.
                return {
                    kind: "stream_key_card" as const,
                    hasKey: !!row?.streamKey,
                    hasChannel: !!row?.serverUrl,
                };
            },
        }),

        rotateStreamKey: tool({
            description:
                "Generate a NEW stream key for the signed-in user, invalidating the old one. Use only when they explicitly ask to reset, rotate, or regenerate their stream key — for example because it leaked. Warn them it will disconnect any broadcast currently using the old key.",
            inputSchema: z.object({}),
            // Human-in-the-loop, and the reason is injection rather than
            // politeness: this is destructive (it kills a live broadcast), and
            // the model's context contains attacker-controlled stream titles.
            // Approval moves the decision from the model to the account owner,
            // where a hostile stream title has no vote.
            needsApproval: true,
            execute: async () => {
                const { rotateStreamKeyFor } = await import("@/server/lib/stream-key");
                const result = await rotateStreamKeyFor(userId);
                // Again: no key in the return value. The client re-fetches.
                return result.ok
                    ? { kind: "stream_key_card" as const, rotated: true, hasKey: true, hasChannel: true }
                    : { kind: "error" as const, message: result.error };
            },
        }),
    };
}

/** @deprecated Use assistantToolsFor(userId) — unscoped tools cannot serve account questions. */
export const assistantTools = publicTools;
