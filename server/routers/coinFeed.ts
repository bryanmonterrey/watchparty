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
import { and, desc, gt, inArray, or, sql, type SQL } from "drizzle-orm";

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
});

type FilterInput = z.infer<typeof filterInput>;

/** Shared WHERE builder so `list` and `newCount` can never drift — a pill that
 *  counts rows the list would filter out is the classic bug here. */
function buildFilters(input: FilterInput): SQL[] {
    const where: SQL[] = [];
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
        .query(async ({ input }) => {
            const where = buildFilters(input);

            if (input.cursor) {
                const c = decodeCursor(input.cursor);
                // A malformed cursor means "start from the top" rather than an
                // error — the rail must never hard-fail on a stale query key.
                if (c) {
                    where.push(
                        sql`(${coinFeedEvents.occurredAt}, ${coinFeedEvents.id}) < (${c.occurredAt}, ${c.id})`,
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
        .query(async ({ input }) => {
            const since = new Date(input.since);
            if (Number.isNaN(since.getTime())) return { count: 0 };

            const where = buildFilters(input);
            where.push(gt(coinFeedEvents.occurredAt, since));

            const [row] = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(coinFeedEvents)
                .where(and(...where));

            // Capped: past a screenful the exact number stops meaning anything
            // and the pill just needs to say "a lot".
            return { count: Math.min(row?.count ?? 0, 99) };
        }),

    /** Coverage stats for the rail's filter panel (per-network tracked counts). */
    coverage: publicProcedure.query(async () => {
        const rows = await db
            .select({
                network: trackedTokens.network,
                tracked: sql<number>`count(*)::int`,
            })
            .from(trackedTokens)
            .groupBy(trackedTokens.network)
            .orderBy(sql`count(*) desc`);
        return rows;
    }),
});
