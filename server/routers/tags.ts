import { z } from "zod";
import { router, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import { posts } from "@/db/schema/content/post";
import { user } from "@/db/schema/auth/user";
import { coinCandles } from "@/db/schema/content/coin-candles";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { withCache } from "@/lib/cache";

/**
 * Tags — posts that mention a coin's ticker.
 *
 * Every piece of content in this app is a post, so a Tag is not a new kind of
 * object: it is a post that wrote `$TICKER`. That is what puts an avatar on the
 * chart at a price and a moment, and what fills the coin table's last column
 * with each trader's most recent take.
 *
 * ## Matched in SQL, with the same rule as lib/tags/extract
 *
 * `\y\$SYMBOL\y` — Postgres word boundaries, case-insensitive. The TypeScript
 * extractor is the definition; this has to agree with it or the chart and the
 * table disagree about what counts. Two rules both encode:
 *
 *   - the `$` is REQUIRED. "bonk is up" is not a tag; "$BONK" is. The plain word
 *     appears constantly in ordinary text.
 *   - the boundary matters. Without `\y` a search for $BONK matches $BONKINU.
 *
 * ⚠️ No index backs this. `posts` is small today (tens of rows) so a scan is
 * nothing; at real volume the answer is a `post_tags` join table written on
 * publish, and this query becomes its backfill. Doing that now would be a
 * migration ahead of any data to put in it.
 *
 * ## Anchoring a Tag on the chart
 *
 * A post has a time but no price — the author need never have traded, which is
 * the whole point of a Tag versus a trade marker. The vertical position comes
 * from the candle covering that minute, and when there is no candle the Tag is
 * returned with `priceUsd: null` and simply is not plotted. Inventing a price
 * would put somebody's words at a level that never traded.
 */

const SYMBOL = z.string().min(1).max(24);

/** `$SYMBOL` on word boundaries — the SQL twin of lib/tags/extract's regex. */
const tagPattern = (symbol: string) => `\\y\\$${symbol.replace(/^\$/, "").replace(/[^A-Za-z0-9]/g, "")}\\y`;

export const tagsRouter = router({
    /**
     * Recent Tags for one coin, newest first — the chart's markers and the
     * "Tags" tab under it.
     */
    forCoin: publicProcedure
        .input(
            z.object({
                network: z.string(),
                poolAddress: z.string().nullish(),
                symbol: SYMBOL,
                limit: z.number().min(1).max(100).default(50),
            }),
        )
        .query(({ input }) =>
            withCache(`tags:coin:v1:${input.symbol.toLowerCase()}:${input.limit}`, 30, async () => {
                const rows = await db
                    .select({
                        id: posts.id,
                        content: posts.content,
                        createdAt: posts.createdAt,
                        userId: posts.userId,
                        username: user.username,
                        name: user.name,
                        avatarUrl: user.image,
                    })
                    .from(posts)
                    .innerJoin(user, eq(user.id, posts.userId))
                    .where(sql`${posts.content} ~* ${tagPattern(input.symbol)}`)
                    .orderBy(desc(posts.createdAt))
                    .limit(input.limit);
                if (!rows.length) return [];

                // Price at each post's minute, from the candle that covers it.
                // One query for the whole page rather than one per Tag: the
                // per-Tag shape is what made the old sparkline column expensive.
                const stamps = rows.map((r) => Math.floor(r.createdAt.getTime() / 1000));
                const priceByBucket = new Map<number, number>();
                if (input.poolAddress && stamps.length) {
                    const from = Math.min(...stamps) - 60;
                    const to = Math.max(...stamps) + 60;
                    const candles = await db
                        .select({ ts: coinCandles.ts, c: coinCandles.c })
                        .from(coinCandles)
                        .where(
                            and(
                                eq(coinCandles.network, input.network),
                                eq(coinCandles.poolAddress, input.poolAddress),
                                eq(coinCandles.resolution, "1"),
                                gte(coinCandles.ts, from),
                                lte(coinCandles.ts, to),
                            ),
                        );
                    for (const c of candles) priceByBucket.set(c.ts, c.c);
                }

                return rows.map((r) => {
                    const ts = Math.floor(r.createdAt.getTime() / 1000);
                    const bucket = Math.floor(ts / 60) * 60;
                    return {
                        id: r.id,
                        userId: r.userId,
                        username: r.username,
                        name: r.name,
                        avatarUrl: r.avatarUrl,
                        // Trimmed for the column; the post itself is one click away.
                        text: (r.content ?? "").trim().slice(0, 280),
                        ts,
                        // null when no candle covers that minute — not plotted,
                        // rather than plotted at a made-up level.
                        priceUsd: priceByBucket.get(bucket) ?? null,
                    };
                });
            }),
        ),

    /**
     * Each author's MOST RECENT Tag for this coin — the coin table's last
     * column, which shows one line per trader rather than a feed.
     *
     * Keyed by USERNAME, not user id: the table's rows come from
     * `resolveTraders`, which maps a wallet to a username and an avatar and
     * never carries an id. Keying by something the caller does not have is a
     * map that silently never hits.
     *
     * DISTINCT ON is exactly this question in one pass; grouping and then
     * re-querying for each author's latest would be a query per row of the
     * table.
     */
    latestByAuthor: publicProcedure
        .input(z.object({ symbol: SYMBOL, limit: z.number().min(1).max(200).default(100) }))
        .query(({ input }) =>
            withCache(`tags:latest:v1:${input.symbol.toLowerCase()}:${input.limit}`, 30, async () => {
                const rows = await db.execute<{
                    user_id: string;
                    username: string | null;
                    content: string | null;
                    created_at: Date;
                }>(sql`
                    SELECT DISTINCT ON (p."userId")
                           p."userId" AS user_id, u.username, p.content, p."createdAt" AS created_at
                    FROM ${posts} p
                    JOIN ${user} u ON u.id = p."userId"
                    WHERE p.content ~* ${tagPattern(input.symbol)}
                    ORDER BY p."userId", p."createdAt" DESC
                    LIMIT ${input.limit}
                `);

                const out: Record<string, { text: string; ts: number }> = {};
                for (const r of rows as unknown as { username: string | null; content: string | null; created_at: Date }[]) {
                    if (!r.username) continue;
                    out[r.username] = {
                        text: (r.content ?? "").trim().slice(0, 280),
                        ts: Math.floor(new Date(r.created_at).getTime() / 1000),
                    };
                }
                return out;
            }),
        ),
});
