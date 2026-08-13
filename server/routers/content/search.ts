/**
 * The app-wide search behind the header dropdown and /search's Coins tab.
 *
 * Split out of server/routers/content.ts when the coin-address and DB-fallback
 * paths pushed it back over the 1000-line guard. Pure move — spread back into
 * the same router, so every caller path (trpc.content.search) is unchanged.
 */
import { z } from "zod";
import { publicProcedure } from "../../trpc";
import { db } from "@/db";
import { posts, tokens, trendingCoins } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, and, or, ilike, sql, desc } from "drizzle-orm";
import { typesenseClient, typesenseReady, noteTypesenseOk, noteTypesenseFailure } from "@/lib/typesense/client";
import { resolveCoin } from "@/lib/coins/resolve";
import { searchPairs } from "@/lib/coins/dexscreener";

export const searchProcedures = {
    search: publicProcedure
        .input(
            z.object({
                query: z.string().default(""),
                limit: z.number().min(1).max(50).default(5),
            })
        )
        .query(async ({ input }) => {
            // ⚠️ `users` is in this shape deliberately. The success path returns
            // it and the old empty-query return did not, so a caller reading
            // `.users` got undefined on an empty query — harmless until search
            // started failing and every response looked like that one.
            const empty = { videos: [], users: [], posts: [], tokens: [], streams: [] };
            const query = input.query.trim();
            if (!query) return empty;

            // A token hit knows where it navigates: a coin we launched lives at
            // /<ticker>, everything else at /coin/<network>/<address>. The
            // dropdown can't tell the two apart, so the row carries its href.
            type TokenHit = {
                id: string;
                name: string | null;
                ticker: string | null;
                imageUrl: string | null;
                tokenAddress: string | null;
                price: number | null;
                change24h: number | null;
                marketCap: number | null;
                volume24h: number | null;
                href: string;
            };
            const ownTokenHref = (t: { ticker: string | null; tokenAddress: string | null }) =>
                t.ticker ? `/${t.ticker.toLowerCase()}` : `/coin/${t.tokenAddress}`;

            // ── A pasted ADDRESS is a lookup, not a text search ──────────────
            //
            // Any coin on any chain, not just ones we launched: our own tokens
            // row first, then lib/coins/resolve (trending board → alert watch
            // list → coin_index → Dexscreener, written back to coin_index).
            // This path never involves Typesense — an index over OUR database
            // cannot know a coin that exists only on-chain, which is why
            // pasting an address returned nothing even when the index was up.
            const looksLikeAddress =
                /^0x[0-9a-fA-F]{40}$/.test(query) ||         // EVM
                /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query); // Solana base58
            if (looksLikeAddress) {
                const [own] = await db
                    .select({
                        id: tokens.id,
                        name: tokens.name,
                        ticker: tokens.ticker,
                        imageUrl: tokens.imageUrl,
                        tokenAddress: tokens.tokenAddress,
                        priceUsd: tokens.priceUsd,
                        priceChange24h: tokens.priceChange24h,
                        marketCapUsd: tokens.marketCapUsd,
                        volume24hUsd: tokens.volume24hUsd,
                    })
                    .from(tokens)
                    .where(and(eq(tokens.tokenAddress, query), eq(tokens.status, "live")))
                    .limit(1);
                if (own) {
                    const hit: TokenHit = {
                        id: own.id,
                        name: own.name,
                        ticker: own.ticker,
                        imageUrl: own.imageUrl,
                        tokenAddress: own.tokenAddress,
                        price: own.priceUsd,
                        change24h: own.priceChange24h,
                        marketCap: own.marketCapUsd,
                        volume24h: own.volume24hUsd,
                        href: ownTokenHref(own),
                    };
                    return { ...empty, tokens: [hit] };
                }
                const coin = await resolveCoin(query).catch(() => null);
                if (coin) {
                    const hit: TokenHit = {
                        id: coin.id,
                        name: coin.name ?? coin.symbol,
                        ticker: coin.symbol,
                        imageUrl: coin.imageUrl,
                        tokenAddress: coin.tokenAddress,
                        price: coin.priceUsd,
                        change24h: coin.priceChange24h,
                        marketCap: coin.marketCapUsd,
                        volume24h: coin.volume24hUsd,
                        href: `/coin/${coin.network}/${coin.tokenAddress}`,
                    };
                    return { ...empty, tokens: [hit] };
                }
                // Nobody has heard of the address — fall through to text
                // search rather than empty, in case it's a pathological
                // username instead of a coin.
            }

            // ── Text search: Typesense while it's reachable ──────────────────
            //
            // Search DEGRADES, it does not 500 — and since 2026-08-13 it
            // degrades to the DATABASE, not to nothing. (That day
            // TYPESENSE_HOST was NXDOMAIN — the cluster had been deleted — and
            // this procedure first 500'd on every keystroke, then returned
            // zero results for everything. The breaker in lib/typesense/client
            // stops us re-dialling a dead host; the ilike fallback below keeps
            // search working while it's tripped.)
            if (typesenseReady()) {
                try {
                    const { results } = await typesenseClient.multiSearch.perform(
                    {
                        searches: [
                            {
                                collection: "users",
                                q: query,
                                query_by: "name,username",
                                per_page: input.limit,
                            },
                            {
                                collection: "posts",
                                q: query,
                                query_by: "content",
                                per_page: input.limit,
                            },
                            {
                                collection: "tokens",
                                q: query,
                                query_by: "name,ticker,tokenAddress",
                                per_page: input.limit,
                            },
                        ],
                    },
                    {}
                    ) as { results: Array<{ hits?: Array<{ document: Record<string, unknown> }> }> };
                    noteTypesenseOk();

                    const userHits  = results[0]?.hits ?? [];
                    const postHits  = results[1]?.hits ?? [];
                    const tokenHits = results[2]?.hits ?? [];

                    const userResults = userHits.map(h => ({
                        id:         h.document.id         as string,
                        name:       h.document.name       as string,
                        username:   h.document.username   as string,
                        avatar_url: (h.document.avatar_url as string | undefined) ?? null,
                    }));

                    const postResults = postHits.map(h => ({
                        id:       h.document.id       as string,
                        content:  h.document.content  as string,
                        imageUrl: (h.document.imageUrl as string | undefined) ?? null,
                    }));

                    const tokenResults = tokenHits.map(h => ({
                        id:           h.document.id           as string,
                        name:         h.document.name         as string,
                        ticker:       h.document.ticker       as string,
                        imageUrl:     (h.document.imageUrl     as string | undefined) ?? null,
                        tokenAddress: (h.document.tokenAddress as string | undefined) ?? null,
                    }));

                    // Enrich tokens with live market data from DexScreener
                    const tokenAddresses = tokenResults.map(t => t.tokenAddress).filter((a): a is string => !!a);
                    const priceMap: Record<string, { price: number; change24h: number; marketCap: number | null; volume24h: number | null }> = {};

                    if (tokenAddresses.length > 0) {
                        try {
                            const res = await fetch(
                                `https://api.dexscreener.com/latest/dex/tokens/${tokenAddresses.join(",")}`,
                                { signal: AbortSignal.timeout(5000) }
                            );
                            if (res.ok) {
                                const json = await res.json();
                                for (const pair of (json.pairs ?? [])) {
                                    const addr = pair.baseToken?.address?.toLowerCase();
                                    if (!addr || priceMap[addr]) continue;
                                    priceMap[addr] = {
                                        price: Number(pair.priceUsd) || 0,
                                        change24h: pair.priceChange?.h24 ?? 0,
                                        marketCap: pair.marketCap ?? null,
                                        volume24h: pair.volume?.h24 ?? null,
                                    };
                                }
                            }
                        } catch {
                            // non-critical — return tokens without price data
                        }
                    }

                    const enhancedTokenResults: TokenHit[] = tokenResults.map(t => {
                        const market = t.tokenAddress ? priceMap[t.tokenAddress.toLowerCase()] : undefined;
                        return {
                            ...t,
                            price: market?.price ?? null,
                            change24h: market?.change24h ?? null,
                            marketCap: market?.marketCap ?? null,
                            volume24h: market?.volume24h ?? null,
                            href: ownTokenHref(t),
                        };
                    });

                    return { videos: [], users: userResults, posts: postResults, tokens: enhancedTokenResults, streams: [] };
                } catch (err) {
                    noteTypesenseFailure(err);
                    // fall through — the DB can still answer
                }
            }

            // ── DB fallback: ilike over the same three entities ──────────────
            //
            // At current row counts Postgres answers these in single-digit ms;
            // user.search and post.searchPosts already run the identical
            // pattern in production. Tokens additionally search the trending
            // board, so coins the app merely tracks (not launched) are
            // findable by name/ticker too — with the market columns their
            // sync already keeps fresh.
            const esc = query.replace(/[%_\\]/g, (c) => `\\${c}`);
            const anywhere = `%${esc}%`;
            const [userRows, postRows, ownRows, boardRows, globalRows] = await Promise.all([
                db
                    .select({ id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url })
                    .from(user)
                    .where(or(ilike(user.name, anywhere), ilike(user.username, anywhere)))
                    .limit(input.limit),
                db
                    .select({ id: posts.id, content: posts.content, imageUrl: posts.imageUrl })
                    .from(posts)
                    .where(and(eq(posts.status, "published"), or(ilike(posts.content, anywhere), ilike(posts.title, anywhere))))
                    .orderBy(desc(posts.createdAt))
                    .limit(input.limit),
                db
                    .select({
                        id: tokens.id,
                        name: tokens.name,
                        ticker: tokens.ticker,
                        imageUrl: tokens.imageUrl,
                        tokenAddress: tokens.tokenAddress,
                        priceUsd: tokens.priceUsd,
                        priceChange24h: tokens.priceChange24h,
                        marketCapUsd: tokens.marketCapUsd,
                        volume24hUsd: tokens.volume24hUsd,
                    })
                    .from(tokens)
                    .where(and(
                        eq(tokens.status, "live"),
                        or(ilike(tokens.ticker, anywhere), ilike(tokens.name, anywhere)),
                    ))
                    .orderBy(
                        sql`case when lower(${tokens.ticker}) like ${esc.toLowerCase() + "%"} then 0 else 1 end`,
                        sql`${tokens.marketCapUsd} desc nulls last`,
                    )
                    .limit(input.limit),
                db
                    .select({
                        id: trendingCoins.id,
                        network: trendingCoins.network,
                        tokenAddress: trendingCoins.tokenAddress,
                        symbol: trendingCoins.symbol,
                        name: trendingCoins.name,
                        imageUrl: trendingCoins.imageUrl,
                        priceUsd: trendingCoins.priceUsd,
                        priceChange24h: trendingCoins.priceChange24h,
                        marketCapUsd: trendingCoins.marketCapUsd,
                        volume24hUsd: trendingCoins.volume24hUsd,
                    })
                    .from(trendingCoins)
                    .where(or(ilike(trendingCoins.symbol, anywhere), ilike(trendingCoins.name, anywhere)))
                    .orderBy(sql`${trendingCoins.volume24hUsd} desc nulls last`)
                    .limit(input.limit),
                // The GLOBAL half: any coin Dexscreener indexes, by name or
                // ticker — this is what makes typing "cashcat" work without the
                // coin ever having touched our tables. Skipped for one-char
                // queries (pure noise) and returns [] on any upstream failure.
                query.length >= 2 ? searchPairs(query, input.limit) : Promise.resolve([]),
            ]);

            // Our launches first, then board coins — deduped by address, since
            // a coin we launched can also be on the trending board.
            const seenAddresses = new Set<string>();
            const tokenResults: TokenHit[] = [];
            for (const t of ownRows) {
                if (t.tokenAddress) seenAddresses.add(t.tokenAddress.toLowerCase());
                tokenResults.push({
                    id: t.id,
                    name: t.name,
                    ticker: t.ticker,
                    imageUrl: t.imageUrl,
                    tokenAddress: t.tokenAddress,
                    price: t.priceUsd,
                    change24h: t.priceChange24h,
                    marketCap: t.marketCapUsd,
                    volume24h: t.volume24hUsd,
                    href: ownTokenHref(t),
                });
            }
            for (const c of boardRows) {
                if (tokenResults.length >= input.limit) break;
                if (seenAddresses.has(c.tokenAddress.toLowerCase())) continue;
                seenAddresses.add(c.tokenAddress.toLowerCase());
                tokenResults.push({
                    id: c.id,
                    name: c.name ?? c.symbol,
                    ticker: c.symbol,
                    imageUrl: c.imageUrl,
                    tokenAddress: c.tokenAddress,
                    price: c.priceUsd,
                    change24h: c.priceChange24h,
                    marketCap: c.marketCapUsd,
                    volume24h: c.volume24hUsd,
                    href: `/coin/${c.network}/${c.tokenAddress}`,
                });
            }
            for (const p of globalRows) {
                if (tokenResults.length >= input.limit) break;
                if (seenAddresses.has(p.tokenAddress.toLowerCase())) continue;
                seenAddresses.add(p.tokenAddress.toLowerCase());
                tokenResults.push({
                    id: `${p.network}:${p.tokenAddress}`,
                    name: p.name ?? p.symbol,
                    ticker: p.symbol,
                    imageUrl: p.imageUrl,
                    tokenAddress: p.tokenAddress,
                    price: p.priceUsd,
                    change24h: p.priceChange24h,
                    marketCap: p.marketCapUsd,
                    volume24h: p.volume24hUsd,
                    href: `/coin/${p.network}/${p.tokenAddress}`,
                });
            }

            return {
                videos: [],
                users: userRows,
                posts: postRows,
                tokens: tokenResults.slice(0, input.limit),
                streams: [],
            };
        }),
};
