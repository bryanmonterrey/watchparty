import { z } from "zod";
import { router, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import { posts } from "@/db/schema/content/post";
import { postTags } from "@/db/schema/content/post-tag";
import { user } from "@/db/schema/auth/user";
import { coinCandles } from "@/db/schema/content/coin-candles";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { withCache } from "@/lib/cache";

/**
 * Tags — the coins a post references.
 *
 * A Tag is PICKED in the composer: typing `$` then a character opens a ticker
 * dropdown, and choosing one stores a reference. It is not parsed out of the
 * text afterwards.
 *
 * ## That design is what makes this correct, not just convenient
 *
 * The first implementation matched `$TICKER` against post text at query time,
 * and shipped a pattern that matched NOTHING — `\y\$BONK\y`, where `\y`
 * asserts a word boundary and `$` is not a word character. Nothing failed. A
 * broken matcher and a coin nobody tagged return the same empty list, so the
 * feature would have read as "no tags yet" on every coin indefinitely.
 *
 * A stored reference removes the failure mode rather than fixing an instance of
 * it: the row is there or it is not, and there is no pattern left to be subtly
 * wrong. It also settles WHICH coin, which text cannot — the same ticker is
 * minted on every chain repeatedly (eleven distinct mints called `BOT` on the
 * live board). "$BOT" is ambiguous; a picked reference is not.
 */

const SYMBOL = z.string().min(1).max(24);

export const tagsRouter = router({
    /**
     * Recent Tags for one coin, newest first — the chart's markers and the
     * "Tags" tab under it.
     */
    /**
     * Recent Tags for one coin, newest first — the chart's markers.
     *
     * Anchored at the post's time and the price of the 1m candle covering that
     * minute. A post has a time but no price: the author need never have traded,
     * which is the whole difference between a Tag and a swap marker. With no
     * candle for that minute the Tag comes back `priceUsd: null` and is not
     * plotted — inventing a price would put somebody's words at a level that
     * never traded.
     */
    forCoin: publicProcedure
        .input(
            z.object({
                network: z.string(),
                tokenAddress: z.string(),
                poolAddress: z.string().nullish(),
                limit: z.number().min(1).max(100).default(50),
            }),
        )
        .query(({ input }) =>
            withCache(
                `tags:coin:v2:${input.network}:${input.tokenAddress}:${input.limit}`,
                30,
                async () => {
                    const rows = await db
                        .select({
                            id: posts.id,
                            content: posts.content,
                            createdAt: postTags.createdAt,
                            username: user.username,
                            avatarUrl: user.image,
                        })
                        .from(postTags)
                        .innerJoin(posts, eq(posts.id, postTags.postId))
                        .innerJoin(user, eq(user.id, posts.userId))
                        .where(
                            and(
                                eq(postTags.network, input.network),
                                eq(postTags.tokenAddress, input.tokenAddress),
                            ),
                        )
                        .orderBy(desc(postTags.createdAt))
                        .limit(input.limit);
                    if (!rows.length) return [];

                    const stamps = rows.map((r) => Math.floor(r.createdAt.getTime() / 1000));
                    const priceByBucket = new Map<number, number>();
                    if (input.poolAddress) {
                        // One query for the page, not one per Tag.
                        const candles = await db
                            .select({ ts: coinCandles.ts, c: coinCandles.c })
                            .from(coinCandles)
                            .where(
                                and(
                                    eq(coinCandles.network, input.network),
                                    eq(coinCandles.poolAddress, input.poolAddress),
                                    eq(coinCandles.resolution, "1"),
                                    gte(coinCandles.ts, Math.min(...stamps) - 60),
                                    lte(coinCandles.ts, Math.max(...stamps) + 60),
                                ),
                            );
                        for (const c of candles) priceByBucket.set(c.ts, c.c);
                    }

                    return rows.map((r) => {
                        const ts = Math.floor(r.createdAt.getTime() / 1000);
                        return {
                            id: r.id,
                            username: r.username,
                            avatarUrl: r.avatarUrl,
                            text: (r.content ?? "").trim().slice(0, 280),
                            ts,
                            priceUsd: priceByBucket.get(Math.floor(ts / 60) * 60) ?? null,
                        };
                    });
                },
            ),
        ),

    /**
     * Each author's MOST RECENT Tag for this coin — the coin table's last
     * column, one line per trader rather than a feed.
     *
     * Keyed by USERNAME: the table's rows come from `resolveTraders`, which maps
     * a wallet to a username and an avatar and never carries a user id, so an
     * id-keyed map would silently never hit.
     */
    latestByAuthor: publicProcedure
        .input(
            z.object({
                network: z.string(),
                tokenAddress: z.string(),
                limit: z.number().min(1).max(200).default(100),
            }),
        )
        .query(({ input }) =>
            withCache(
                `tags:latest:v2:${input.network}:${input.tokenAddress}:${input.limit}`,
                30,
                async () => {
                    // DISTINCT ON answers "each author's latest" in one pass;
                    // grouping and re-querying per author is a query per table row.
                    const rows = await db
                        .selectDistinctOn([posts.userId], {
                            username: user.username,
                            content: posts.content,
                            createdAt: postTags.createdAt,
                        })
                        .from(postTags)
                        .innerJoin(posts, eq(posts.id, postTags.postId))
                        .innerJoin(user, eq(user.id, posts.userId))
                        .where(
                            and(
                                eq(postTags.network, input.network),
                                eq(postTags.tokenAddress, input.tokenAddress),
                            ),
                        )
                        .orderBy(posts.userId, desc(postTags.createdAt))
                        .limit(input.limit);

                    const out: Record<string, { text: string; ts: number }> = {};
                    for (const r of rows) {
                        if (!r.username) continue;
                        out[r.username] = {
                            text: (r.content ?? "").trim().slice(0, 280),
                            ts: Math.floor(r.createdAt.getTime() / 1000),
                        };
                    }
                    return out;
                },
            ),
        ),

    // NOTE: there is no `search` here. `trade.searchTickers` already backs the
    // composer's dropdown (components/browse/cashtag-autocomplete), and a second
    // search would be a second answer to "which coins match $bo".
});
