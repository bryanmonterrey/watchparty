import type { MessageReaction } from "./community-message-reactions";

/**
 * Memo comparator for `CommunityChatItem`.
 *
 * ## Why a custom one
 *
 * Two of the row's props are rebuilt with a fresh identity on every ingest even
 * when their VALUES are unchanged:
 *
 * - `reactions` — `community.getMessages` aggregates them per page, so every
 *   refetch (and there is one on every incoming message, via the channel
 *   subscription's `invalidate`) produces new array and object literals.
 * - `replyTo` — constructed as an inline object literal in the list, so it is
 *   a new object on every render by construction.
 *
 * With the default shallow compare, either one alone makes `React.memo` a
 * no-op: every row re-renders on every message that lands in the channel, which
 * re-reconciles every row's hover toolbar, emoji picker and reaction chips.
 * Value-comparing two tiny arrays per row is far cheaper than one spurious row
 * render.
 *
 * ## Why it's key-driven rather than an explicit prop list
 *
 * Every other prop is compared with `Object.is`, discovered from the props
 * object itself — so a prop added later is compared correctly by default. An
 * explicit list would silently stop comparing anything added after it was
 * written, which is a memo bug that looks like a rendering bug.
 *
 * Note this only pays off because the row's remaining props are already stable:
 * `emojiMap` is `useMemo`'d at the channel page (it was an inline
 * `Object.fromEntries` — a new object on every keystroke and presence tick).
 */

export function reactionsEqual(
    a: MessageReaction[] | undefined,
    b: MessageReaction[] | undefined,
): boolean {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (
            a[i].emoji !== b[i].emoji ||
            a[i].count !== b[i].count ||
            a[i].reactedByMe !== b[i].reactedByMe
        ) {
            return false;
        }
    }
    return true;
}

type ReplyTo = { userName: string | null; content: string; deleted: boolean } | null | undefined;

export function replyToEqual(a: ReplyTo, b: ReplyTo): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
        a.userName === b.userName &&
        a.content === b.content &&
        a.deleted === b.deleted
    );
}

/** Value keys — everything else is compared with `Object.is`. */
const VALUE_COMPARED = {
    reactions: (a: unknown, b: unknown) =>
        reactionsEqual(a as MessageReaction[] | undefined, b as MessageReaction[] | undefined),
    replyTo: (a: unknown, b: unknown) => replyToEqual(a as ReplyTo, b as ReplyTo),
} as const;

export function chatItemPropsEqual<P extends Record<string, unknown>>(
    prev: P,
    next: P,
): boolean {
    const prevKeys = Object.keys(prev);
    if (prevKeys.length !== Object.keys(next).length) return false;

    for (const key of prevKeys) {
        if (!(key in next)) return false;
        const compare = VALUE_COMPARED[key as keyof typeof VALUE_COMPARED];
        if (compare) {
            if (!compare(prev[key], next[key])) return false;
        } else if (!Object.is(prev[key], next[key])) {
            return false;
        }
    }
    return true;
}
