/**
 * Decides which chat rows get full chrome and which read as a continuation.
 *
 * Same author inside a short window is one thought, not five messages: the
 * follow-ups drop the avatar and header and keep only a hover timestamp. It is
 * the single cheapest thing that makes a chat log look like a conversation
 * instead of a table.
 *
 * ## Why this is a function over a flat list, not a check inside the row
 *
 * Phase 6's windowing step is the reason. `broad-infinite-list`'s `renderItem`
 * receives **`(item)` only, no index**, so a row cannot look at its neighbour.
 * Any decision that depends on the previous message — the day divider, and this
 * — has to be **precomputed when the pages are flattened**, or it silently stops
 * working the moment the list is virtualised. Building it in that shape now
 * means step 3 is a rendering change rather than a rewrite.
 *
 * ## The window
 *
 * Ten minutes, matching buzz. Long enough that a pause to type doesn't split a
 * thought; short enough that "yesterday, same person" still gets full chrome.
 */

const GROUP_WINDOW_MS = 10 * 60 * 1000;

/** The minimum a row must expose for grouping. Anything else rides along. */
export type GroupableMessage = {
    id: string;
    userId?: string | null;
    createdAt: Date | string;
    /** System notices are never grouped — they aren't anybody's speech. */
    system?: boolean | null;
    /** A reply shows its quoted parent, which needs the full header above it. */
    replyToId?: string | null;
    /** A pinned row carries its own badge and is meant to be findable. */
    pinned?: boolean | null;
};

export type GroupFlags = {
    /** Same author, close in time: drop the avatar and header. */
    isContinuation: boolean;
    /** First row of a new calendar day: a divider goes above it. */
    isNewDay: boolean;
};

function toTime(value: Date | string): number {
    return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function sameDay(a: Date | string, b: Date | string): boolean {
    const da = a instanceof Date ? a : new Date(a);
    const db = b instanceof Date ? b : new Date(b);
    return da.toDateString() === db.toDateString();
}

/**
 * Should `message` render as a continuation of `previous` (the chronologically
 * OLDER neighbour)?
 *
 * Deliberately conservative — every uncertain case gets full chrome, because a
 * wrongly-grouped message hides who said it, while a wrongly-ungrouped one only
 * costs a little space.
 */
export function isContinuation(
    previous: GroupableMessage | undefined,
    message: GroupableMessage,
): boolean {
    if (!previous) return false;
    if (previous.system || message.system) return false;
    // A reply renders its quoted parent above the text; without the header that
    // quote appears to belong to whoever spoke last.
    if (message.replyToId) return false;
    // A pinned row is meant to be spotted while scanning. Stripping its avatar
    // and name to save a line defeats the reason it was pinned.
    if (message.pinned) return false;
    // Webhooks and deleted-author rows can both surface as an empty userId.
    // Grouping on "" would merge two different senders into one block.
    if (!previous.userId || !message.userId) return false;
    if (previous.userId !== message.userId) return false;
    if (!sameDay(previous.createdAt, message.createdAt)) return false;

    const gap = toTime(message.createdAt) - toTime(previous.createdAt);
    if (!Number.isFinite(gap)) return false;
    // Negative gaps mean the caller handed these over out of order — refuse
    // rather than group on a comparison that doesn't mean what it looks like.
    if (gap < 0) return false;
    return gap <= GROUP_WINDOW_MS;
}

/**
 * Decorate a CHRONOLOGICAL (oldest → newest) list with its grouping flags.
 *
 * ⚠️ Order matters and is not checked: community chat holds pages newest-first
 * and renders with `flex-col-reverse`, so it must reverse into chronological
 * order before calling this. Passing a newest-first list produces flags that
 * look plausible and are backwards.
 */
export function withGroupFlags<T extends GroupableMessage>(
    messages: readonly T[],
): (T & GroupFlags)[] {
    return messages.map((message, i) => {
        const previous = i > 0 ? messages[i - 1] : undefined;
        return {
            ...message,
            isContinuation: isContinuation(previous, message),
            isNewDay: !previous || !sameDay(previous.createdAt, message.createdAt),
        };
    });
}

export { GROUP_WINDOW_MS };
