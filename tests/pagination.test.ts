import { describe, expect, test } from "bun:test";

import { takePage } from "@/server/lib/paginate";

type Row = { id: string; createdAt: Date };

/** Rows newest-first, one second apart — the shape every router queries. */
function rows(n: number): Row[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `r${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0) - i * 1000),
    }));
}

/**
 * Walks every page exactly the way production does: the query applies a strict
 * `createdAt <` cursor filter AND a SQL `LIMIT limit + 1`, so the handler only
 * ever sees `limit + 1` rows. Then it asserts nothing is lost or duplicated.
 *
 * The `limit + 1` slice is load-bearing — without it the old `rows.pop()` shape
 * pops the oldest row of the *whole table* instead of the probe row, which
 * fails for the wrong reason and hides the real defect. With it, the old shape
 * drops exactly one row per page boundary (r10, r21, r32, … at limit 10).
 */
function walkAllPages(all: Row[], limit: number): string[] {
    const seen: string[] = [];
    let cursor: string | undefined;
    // Bound the loop so a broken cursor can't hang the suite.
    for (let guard = 0; guard < 200; guard += 1) {
        const visible = cursor
            ? all.filter((r) => r.createdAt < new Date(cursor!))
            : all;
        const queried = visible.slice(0, limit + 1); // the SQL LIMIT
        const { items, hasMore, lastItem } = takePage(queried, limit);
        seen.push(...items.map((r) => r.id));
        if (!hasMore) return seen;
        cursor = lastItem!.createdAt.toISOString();
    }
    throw new Error("pagination did not terminate");
}

describe("takePage", () => {
    test("returns everything and no cursor when under the limit", () => {
        const { items, hasMore, lastItem } = takePage(rows(3), 10);
        expect(items).toHaveLength(3);
        expect(hasMore).toBe(false);
        expect(lastItem?.id).toBe("r2");
    });

    test("exact-multiple final page is not mistaken for more", () => {
        const { items, hasMore } = takePage(rows(10), 10);
        expect(items).toHaveLength(10);
        // 10 rows from a limit+1 probe means the 11th didn't exist.
        expect(hasMore).toBe(false);
    });

    test("trims the probe row off the page", () => {
        const { items, hasMore } = takePage(rows(11), 10);
        expect(items).toHaveLength(10);
        expect(hasMore).toBe(true);
        expect(items.at(-1)!.id).toBe("r9");
    });

    test("cursor comes from the last RETURNED row, not the probe row", () => {
        const { lastItem } = takePage(rows(11), 10);
        // r10 is the probe. Using it as the cursor is the bug: a strict
        // `lt` on the next page would then exclude r10 entirely.
        expect(lastItem!.id).toBe("r9");
    });

    test("does not mutate the caller's array", () => {
        const source = rows(11);
        takePage(source, 10);
        expect(source).toHaveLength(11);
    });

    test("walking every page loses nothing (the regression this prevents)", () => {
        const all = rows(95);
        const seen = walkAllPages(all, 10);
        expect(seen).toEqual(all.map((r) => r.id));
    });

    test("walking every page duplicates nothing", () => {
        const seen = walkAllPages(rows(95), 10);
        expect(new Set(seen).size).toBe(seen.length);
    });

    test("holds when the total is an exact multiple of the page size", () => {
        const all = rows(40);
        expect(walkAllPages(all, 10)).toEqual(all.map((r) => r.id));
    });

    test("holds for a single-row page size", () => {
        const all = rows(7);
        expect(walkAllPages(all, 1)).toEqual(all.map((r) => r.id));
    });

    test("empty result set terminates immediately", () => {
        const { items, hasMore, lastItem } = takePage<Row>([], 10);
        expect(items).toEqual([]);
        expect(hasMore).toBe(false);
        expect(lastItem).toBeUndefined();
    });
});
