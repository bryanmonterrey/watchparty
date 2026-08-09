/**
 * Keyset pagination: turning a `limit + 1` probe into a page + cursor.
 *
 * ## The bug this exists to prevent
 *
 * The probe row is the FIRST ROW OF THE NEXT PAGE, not the last row of this
 * one. Using its cursor value and then filtering the next page with a strict
 * comparison (`lt(createdAt, cursor)`) excludes that exact row — so it is
 * popped off this page and skipped by the next one. It is never delivered.
 *
 *     ✗  const next = rows.pop();                 // rows[limit] — the probe
 *        nextCursor = next.createdAt.toISOString();
 *        // next page: lt(createdAt, nextCursor)  → the probe row is gone
 *
 * At `limit: 30` that silently drops one item every 30 on an infinite scroll —
 * a comment, a chat message, a notification, a feed post. It doesn't throw, it
 * doesn't fail a type-check or a test, and it's unfalsifiable from the UI: it
 * just reads as "the feed skipped something".
 *
 * Seven procedures shipped this shape (found 2026-08-08 while reading buzz's
 * channel-window spec, which states the rule outright: *"the next-page cursor
 * is the `(created_at, id)` of the **last retained row**"*).
 *
 * ## The rule
 *
 * The cursor comes from the last **returned** row. The probe row is used ONLY
 * to answer "is there more?" and is then discarded — the next page re-fetches
 * it as its own first row.
 *
 *     const { items, hasMore, lastItem } = takePage(rows, input.limit);
 *     const nextCursor = hasMore ? lastItem!.createdAt.toISOString() : undefined;
 *     return { items, nextCursor };
 *
 * `hasMore` is a fact from the probe, never inferred from `items.length`.
 * `items.length < limit` implies nothing on an exact-multiple final page.
 *
 * ## Still to do (see docs/buzz-adoption-plan.md, Phase 9b)
 *
 * These cursors are timestamp-only. Postgres `now()` is transaction-scoped, so
 * every row written in one transaction shares a timestamp — and a tie at a page
 * boundary skips rows even with the fix above. The durable form is a composite
 * `(createdAt, id)` cursor with
 * `createdAt < ts OR (createdAt = ts AND id > id)`.
 */

export type Page<T> = {
    /** The rows to return to the client — at most `limit`. */
    items: T[];
    /** Probe result. Authoritative; never re-derive it from `items.length`. */
    hasMore: boolean;
    /** Last **returned** row — the one the next cursor must come from. */
    lastItem: T | undefined;
};

/**
 * @param rows  Query result fetched with `.limit(limit + 1)`.
 * @param limit The page size the caller asked for.
 */
export function takePage<T>(rows: readonly T[], limit: number): Page<T> {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : [...rows];
    return { items, hasMore, lastItem: items[items.length - 1] };
}
