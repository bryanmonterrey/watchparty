/**
 * Keyset cursors that survive ties.
 *
 * ## The bug this exists to stop
 *
 * A value-only cursor — `WHERE col < :cursor` — steps over every row TIED with
 * the cursor's value. `post.searchPosts` shipped that: `baseScore` is
 * `real().default(0)`, so every post with no engagement is exactly 0, page 2
 * walked into the run of zeros, its cursor became `"0"`, and page 3 asked for
 * `baseScore < 0` — which matches nothing, ever. Measured on 120 posts with 100
 * tied at 0: **40 reachable, 80 silently unreachable.**
 *
 * The fix is always the same shape, so it lives here rather than being
 * hand-rolled per procedure:
 *
 *     WHERE  col < :value  OR (col = :value AND id > :id)
 *     ORDER BY col DESC, id ASC
 *
 * The `id` arm resumes *inside* a run of tied rows instead of stepping past it,
 * and the `id ASC` tiebreak is what makes that resumption well-defined — a
 * value-only ORDER BY leaves tied rows in arbitrary order, so the cursor points
 * at a position the next query may not reproduce.
 *
 * ## When you need it
 *
 * Ties are **structural** whenever the sort column has a default or a small
 * domain — scores, counts, booleans, anything `default(0)`. They are
 * **occasional** on timestamps, and one place they are guaranteed is a bulk
 * insert: Postgres `now()` is transaction-scoped, so every row written by one
 * statement shares a timestamp exactly.
 *
 * Timestamp cursors over user-paced writes (a comment, a follow, a DM) tie
 * rarely enough that the existing value-only ones were left alone as of
 * 2026-08-10 — churning ten working procedures to prevent a rare skip is a
 * worse trade than leaving them. Use this for anything new, and for anything
 * whose column can tie by construction.
 */

/** The separator. Safe because ids are uuids and values are numbers or ISO timestamps — none contain it. */
const SEP = "|";

/**
 * `<value>|<id>`.
 *
 * @param value the sort column's value on the last row of the page
 * @param id    that row's id — the tiebreak
 */
export function encodeKeysetCursor(value: string | number | Date, id: string): string {
    const raw = value instanceof Date ? value.toISOString() : String(value);
    return `${raw}${SEP}${id}`;
}

export type KeysetCursor<T> = { value: T; id: string };

/**
 * Parse a cursor produced by `encodeKeysetCursor`.
 *
 * Returns `null` for anything unusable — including a **legacy value-only
 * cursor** from a client that is mid-session across a deploy. `null` means "no
 * cursor filter", i.e. one repeated page, which is a far better failure than
 * throwing at someone who is simply scrolling.
 *
 * ⚠️ `null` is also what you get from a corrupted cursor, and the two are
 * indistinguishable on purpose. If a caller ever needs to tell them apart, that
 * is a reason to version the cursor, not to make this throw.
 */
export function parseKeysetCursor(cursor: string | null | undefined, kind: "number"): KeysetCursor<number> | null;
export function parseKeysetCursor(cursor: string | null | undefined, kind: "date"): KeysetCursor<Date> | null;
export function parseKeysetCursor(cursor: string | null | undefined, kind: "string"): KeysetCursor<string> | null;
export function parseKeysetCursor(
    cursor: string | null | undefined,
    kind: "number" | "date" | "string",
): KeysetCursor<number | Date | string> | null {
    if (!cursor) return null;

    // lastIndexOf, not indexOf: a value could in principle contain the
    // separator, but an id (uuid) cannot — so the LAST one is always the real
    // boundary.
    const sep = cursor.lastIndexOf(SEP);
    if (sep === -1) return null; // legacy value-only cursor
    const rawValue = cursor.slice(0, sep);
    const id = cursor.slice(sep + 1);
    if (!rawValue || !id) return null;

    if (kind === "number") {
        const value = Number(rawValue);
        return Number.isFinite(value) ? { value, id } : null;
    }
    if (kind === "date") {
        const value = new Date(rawValue);
        return Number.isNaN(value.getTime()) ? null : { value, id };
    }
    return { value: rawValue, id };
}
