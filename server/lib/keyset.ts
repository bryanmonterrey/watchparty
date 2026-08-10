import { and, eq, gt, lt, or, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import type { KeysetCursor } from "@/lib/pagination/keyset";

/**
 * The WHERE half of a composite keyset cursor.
 *
 * `lib/pagination/keyset.ts` owns encoding and parsing; this owns the one SQL
 * shape they exist for:
 *
 *     col < :value  OR (col = :value AND id > :id)     -- descending
 *     col > :value  OR (col = :value AND id > :id)     -- ascending
 *
 * Server-only on purpose. The encode/parse half is in `lib/` because both sides
 * touch cursors, but this imports drizzle, and drizzle has no business being
 * reachable from a client bundle.
 *
 * The `id` arm is the entire point: without it a cursor steps over every row
 * TIED on the sort column. Measured twice on real data — `searchPosts` returned
 * 40 of 120 rows (100 tied at `baseScore` 0), and `getPostsByUser` returned 140
 * of 180 (60 sharing one `createdAt`). Both times the tail was simply gone,
 * with no error anywhere.
 *
 * ⚠️ Callers must ALSO add the id to `ORDER BY` (`… , asc(idCol)`). The
 * resumption this builds is only well-defined if tied rows come back in a
 * stable order; without it the cursor names a position the next query may not
 * reproduce.
 */
export function keysetAfter(
    col: AnyColumn,
    idCol: AnyColumn,
    key: KeysetCursor<number | Date | string> | null,
    direction: "asc" | "desc" = "desc",
): SQL | undefined {
    if (!key) return undefined;
    const beyond = direction === "asc" ? gt(col, key.value) : lt(col, key.value);
    return or(beyond, and(eq(col, key.value), gt(idCol, key.id)));
}
