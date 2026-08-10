import type { InfiniteData } from "@tanstack/react-query";

/**
 * Cache-shape helpers for the DM message list.
 *
 * `message.list` became a `useInfiniteQuery` so DM history past the newest 50 is
 * reachable at all. That changes the cache entry from one page object into
 * `{ pages, pageParams }`, and four call sites across three files write to it
 * optimistically — a sent message, a reaction toggle and its rollback, and a
 * realtime reaction event. Spreading `pages.map(page => …)` across all four is
 * how one of them quietly stops matching the others.
 *
 * So the shape lives here, once, with tests.
 *
 * ## ORDERING — read this before touching anything below
 *
 * The two axes run in OPPOSITE directions, which is the whole reason this file
 * exists:
 *
 * - **Across pages: newest first.** Page 0 is the most recent batch; each
 *   further page walks backwards in time via the keyset cursor.
 * - **Within a page: OLDEST first.** `server/routers/message.ts` selects
 *   `ORDER BY createdAt DESC` and then calls `.reverse()` before returning, so
 *   a page arrives in reading order.
 *
 * Chronological order for the UI is therefore **pages reversed, each page kept
 * as-is**: page N (oldest batch) first, page 0 (newest batch) last. Flattening
 * `pages` in their natural order instead interleaves the batches backwards —
 * the newest 50 would render above older history, and every page load would
 * shuffle the conversation.
 *
 * By the same token a just-sent message is newer than everything, so it belongs
 * at the **end of page 0**, not the front. Prepending it would place it above
 * 50 messages it was written after. (The single-page version appended for
 * exactly this reason; its comment is the only reason this was caught.)
 */

/**
 * Generic over the whole PAGE and the cursor, not just the row.
 *
 * Deliberate, and it earned its keep immediately. Writing these against a
 * hand-declared page shape (`{ messages; nextCursor? }`) and casting at the
 * call sites compiled fine and was wrong twice over: the real page also carries
 * a `success` field, and the cursor is `string | null`, not `string |
 * undefined`. Both were invisible behind `as any` and both surfaced the moment
 * the casts came off.
 *
 * Constraining only to `{ messages }` and returning `InfiniteData<TPage,
 * TCursor>` means the caller's exact type flows straight through — extra fields
 * survive, the cursor keeps its nullability, and the optimistic-send path (the
 * most breakable writer here) is genuinely type-checked rather than nominally.
 */
export type DmPageLike = { messages: unknown[] };

/** The element type of a page's `messages` array. */
export type DmRowOf<TPage extends DmPageLike> = TPage["messages"][number];

/** Stable identity so callers can use the result in a dependency array. */
const EMPTY: never[] = [];

/**
 * Every message, in reading order: oldest at index 0, newest last.
 *
 * Pages are reversed because page 0 is the NEWEST batch — see the ordering note
 * above.
 */
export function flattenDmMessages<TPage extends DmPageLike, TCursor>(
    data: InfiniteData<TPage, TCursor> | undefined,
): DmRowOf<TPage>[] {
    if (!data?.pages?.length) return EMPTY;
    if (data.pages.length === 1) return (data.pages[0]?.messages as DmRowOf<TPage>[]) ?? EMPTY;

    const out: DmRowOf<TPage>[] = [];
    for (let i = data.pages.length - 1; i >= 0; i--) {
        const page = data.pages[i];
        if (page?.messages) out.push(...(page.messages as DmRowOf<TPage>[]));
    }
    return out;
}

/**
 * Apply `fn` to every message, keeping the page structure intact.
 *
 * Walks every page because a reaction toggle knows an id, not a page — and a
 * message near a page boundary is on a different page once older history
 * loads, so a page-0-only patch would silently do nothing for anything the
 * user scrolled back to.
 */
export function mapDmMessages<TPage extends DmPageLike, TCursor>(
    data: InfiniteData<TPage, TCursor> | undefined,
    fn: (message: DmRowOf<TPage>) => DmRowOf<TPage>,
): InfiniteData<TPage, TCursor> | undefined {
    if (!data?.pages?.length) return data;
    return {
        ...data,
        pages: data.pages.map((page) =>
            page?.messages ? { ...page, messages: page.messages.map(fn as (m: unknown) => unknown) } : page,
        ),
    };
}

/**
 * Place a just-sent message at the end of the newest page — i.e. the bottom of
 * the conversation, which is where the sender is looking.
 *
 * Returns `data` untouched when nothing is cached. Deliberate: writing a page
 * here would invent an entry the query never fetched, and the real fetch would
 * then replace it, so the optimistic row would flicker in and out.
 */
export function appendDmMessage<TPage extends DmPageLike, TCursor>(
    data: InfiniteData<TPage, TCursor> | undefined,
    message: DmRowOf<TPage>,
): InfiniteData<TPage, TCursor> | undefined {
    if (!data?.pages?.length) return data;
    const [newest, ...rest] = data.pages;
    return {
        ...data,
        pages: [{ ...newest, messages: [...(newest?.messages ?? []), message] } as TPage, ...rest],
    };
}
