// Read side of the coin alert feed — the /home left rail.
//
// One append-only table (coin_feed_events), one total keyset cursor on
// (occurred_at DESC, id DESC). That totality is load-bearing: the rail is a
// bidirectional sliding window that restores items when you scroll back up, so
// a page boundary has to be exactly reproducible. A cursor on occurred_at alone
// would drop or repeat rows whenever two events share a timestamp — which
// happens constantly, since a cluster window closes on one block.
import { z } from "zod";
import { router, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import { COIN_FEED_KINDS, coinFeedEvents, trackedTokens } from "@/db/schema/content/coin-feed";
import { follows } from "@/db/schema/content/follow";
import { tokens } from "@/db/schema/content/token";
import { and, desc, eq, gt, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { withCache } from "@/lib/cache";

/** Cursor is `${iso}|${id}` — both halves of the ORDER BY, so it's total. */
const encodeCursor = (occurredAt: Date, id: string) => `${occurredAt.toISOString()}|${id}`;

function decodeCursor(cursor: string): { occurredAt: Date; id: string } | null {
    const sep = cursor.lastIndexOf("|");
    if (sep <= 0) return null;
    const occurredAt = new Date(cursor.slice(0, sep));
    const id = cursor.slice(sep + 1);
    if (Number.isNaN(occurredAt.getTime()) || !id) return null;
    return { occurredAt, id };
}

const filterInput = z.object({
    kinds: z.array(z.enum(COIN_FEED_KINDS)).optional(),
    networks: z.array(z.string().max(32)).max(20).optional(),
    minTraders: z.number().int().min(0).max(500).optional(),
    minUsd: z.number().min(0).optional(),
    /** Only coins launched on watchparty. */
    watchpartyOnly: z.boolean().optional(),
    /** The rail's tab. "all" is everything; the other two are viewer-relative. */
    scope: z.enum(["all", "following", "mentions"]).optional(),
});

type FilterInput = z.infer<typeof filterInput>;

/** Shared WHERE builder so `list` and `newCount` can never drift — a pill that
 *  counts rows the list would filter out is the classic bug here.
 *
 *  `viewerId` is the signed-in user (null when logged out), needed only by the
 *  `following` filter. */
function buildFilters(input: FilterInput, viewerId: string | null): SQL[] {
    const where: SQL[] = [];

    if (input.scope && input.scope !== "all") {
        // Both viewer-relative scopes are empty when logged out, rather than an
        // error — the rail should render an empty tab, not blow up.
        if (!viewerId) {
            where.push(sql`false`);
        } else if (input.scope === "following") {
            // An alert "involves" someone you follow if they're the actor (a
            // callout / a market they opened) OR one of the wallets in a
            // cluster resolved to their account. Subqueries rather than
            // loading the follow list — it can be large, and Postgres already
            // has idx_follows_follower for it.
            const followed = sql`(SELECT f."followingId" FROM ${follows} f WHERE f."followerId" = ${viewerId})`;
            where.push(sql`(
                ${coinFeedEvents.actorId} IN ${followed}
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(coalesce(${coinFeedEvents.traders}, '[]'::jsonb)) AS tr
                    WHERE tr->>'userId' IN ${followed}
                )
            )`);
        } else {
            // Mentions = alerts about YOU. Three ways that happens: you're the
            // actor, one of your wallets was in the cluster, or it's activity
            // on a coin you launched (the one that matters most to a creator).
            where.push(sql`(
                ${coinFeedEvents.actorId} = ${viewerId}
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(coalesce(${coinFeedEvents.traders}, '[]'::jsonb)) AS tr
                    WHERE tr->>'userId' = ${viewerId}
                )
                OR ${coinFeedEvents.wpTokenId} IN (
                    SELECT t.id FROM ${tokens} t WHERE t."creatorId" = ${viewerId}
                )
            )`);
        }
    }
    if (input.kinds?.length) where.push(inArray(coinFeedEvents.kind, input.kinds));
    if (input.networks?.length) where.push(inArray(coinFeedEvents.network, input.networks));
    if (input.minTraders != null && input.minTraders > 0) {
        where.push(sql`coalesce(${coinFeedEvents.traderCount}, 0) >= ${input.minTraders}`);
    }
    if (input.minUsd != null && input.minUsd > 0) {
        // Native kinds (callout/prediction/launch) carry no USD value; the
        // amount filter is about trade size, so it must not silently hide them.
        where.push(
            or(
                sql`${coinFeedEvents.usdValue} is null`,
                sql`${coinFeedEvents.usdValue} >= ${input.minUsd}`,
            )!,
        );
    }
    if (input.watchpartyOnly) where.push(sql`${coinFeedEvents.wpTokenId} is not null`);
    return where;
}

const SELECTION = {
    id: coinFeedEvents.id,
    kind: coinFeedEvents.kind,
    network: coinFeedEvents.network,
    trackedTokenId: coinFeedEvents.trackedTokenId,
    wpTokenId: coinFeedEvents.wpTokenId,
    tokenAddress: coinFeedEvents.tokenAddress,
    symbol: coinFeedEvents.symbol,
    tokenImageUrl: coinFeedEvents.tokenImageUrl,
    side: coinFeedEvents.side,
    traderCount: coinFeedEvents.traderCount,
    usdValue: coinFeedEvents.usdValue,
    marketCapUsd: coinFeedEvents.marketCapUsd,
    traders: coinFeedEvents.traders,
    actorId: coinFeedEvents.actorId,
    refId: coinFeedEvents.refId,
    title: coinFeedEvents.title,
    occurredAt: coinFeedEvents.occurredAt,
} as const;

export const coinFeedRouter = router({
    /** One page of alerts, newest first. */
    list: publicProcedure
        .input(
            filterInput.extend({
                limit: z.number().min(1).max(100).default(30),
                cursor: z.string().max(120).nullish(),
            }),
        )
        .query(async ({ input, ctx }) => {
            const where = buildFilters(input, ctx.user?.id ?? null);

            if (input.cursor) {
                const c = decodeCursor(input.cursor);
                // A malformed cursor means "start from the top" rather than an
                // error — the rail must never hard-fail on a stale query key.
                if (c) {
                    // TYPED OPERATORS, NOT A `sql` TEMPLATE. This was
                    // `sql\`(occurred_at, id) < (${date}, ${id})\``, and on
                    // Workers that threw for every cursored page:
                    //
                    //   TypeError [ERR_INVALID_ARG_TYPE]: The "string" argument
                    //   must be of type string or an instance of Buffer or
                    //   ArrayBuffer. Received an instance of Date
                    //
                    // A value interpolated into `sql` carries no column, so
                    // drizzle has no encoder to apply and passes the Date
                    // straight to postgres.js, where workerd's Buffer polyfill
                    // rejects it. Under plain Node the same code works, which is
                    // why it never showed up locally. lt()/eq() take the column,
                    // so drizzle maps the Date through the timestamptz encoder
                    // and sends a string — the same reason newCount's
                    // gt(occurredAt, since) was fine all along.
                    //
                    // Expanded rather than the row-constructor form because the
                    // operators express it directly; verified to return the
                    // identical rows in the identical order off the same
                    // idx_coin_feed_cursor index.
                    where.push(
                        or(
                            lt(coinFeedEvents.occurredAt, c.occurredAt),
                            and(eq(coinFeedEvents.occurredAt, c.occurredAt), lt(coinFeedEvents.id, c.id)),
                        )!,
                    );
                }
            }

            const rows = await db
                .select(SELECTION)
                .from(coinFeedEvents)
                .where(where.length ? and(...where) : undefined)
                .orderBy(desc(coinFeedEvents.occurredAt), desc(coinFeedEvents.id))
                .limit(input.limit + 1); // one extra = "is there another page?"

            const hasMore = rows.length > input.limit;
            const items = hasMore ? rows.slice(0, input.limit) : rows;
            const last = items[items.length - 1];

            return {
                items,
                nextCursor: hasMore && last ? encodeCursor(last.occurredAt, last.id) : null,
            };
        }),

    /** How many alerts have landed since `since` — drives the "n new" pill.
     *  Takes the same filters as `list` so the count matches what would show. */
    newCount: publicProcedure
        .input(filterInput.extend({ since: z.string().datetime() }))
        .query(async ({ input, ctx }) => {
            const since = new Date(input.since);
            if (Number.isNaN(since.getTime())) return { count: 0 };

            const where = buildFilters(input, ctx.user?.id ?? null);
            where.push(gt(coinFeedEvents.occurredAt, since));

            const [row] = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(coinFeedEvents)
                .where(and(...where));

            // Capped: past a screenful the exact number stops meaning anything
            // and the pill just needs to say "a lot".
            return { count: Math.min(row?.count ?? 0, 99) };
        }),

    /** Coverage stats for the rail's filter panel (per-network tracked counts).
     *  Global aggregate, changes only when the scanner adds/drops tracked coins
     *  (minute-scale) — cached 5 min so cold rail mounts skip the Postgres hop. */
    coverage: publicProcedure.query(() =>
        withCache("coinfeed:coverage", 300, () =>
            db
                .select({
                    network: trackedTokens.network,
                    tracked: sql<number>`count(*)::int`,
                })
                .from(trackedTokens)
                .groupBy(trackedTokens.network)
                .orderBy(sql`count(*) desc`)
        )
    ),
});
