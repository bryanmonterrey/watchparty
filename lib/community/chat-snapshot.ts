import superjson from "superjson";
import type { InfiniteData } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

/**
 * Per-channel snapshot of the newest page of chat, so reopening a channel
 * paints instantly instead of showing seven skeleton rows.
 *
 * ## Why this and not a longer `staleTime`
 *
 * The React Query cache is in memory. It survives navigating between channels
 * in one session and nothing else — a reload, a new tab, or coming back
 * tomorrow all start from an empty cache and a spinner, which is most of the
 * times a person actually opens a channel. localStorage is the only tier that
 * survives that, and a channel's newest 50 messages are small enough to keep
 * there.
 *
 * ## `placeholderData`, NOT `initialData`
 *
 * `initialData` is written into the cache as though it came from the server, so
 * it inherits `staleTime` and can suppress the fetch entirely — a stale snapshot
 * would then be the only thing you ever see. `placeholderData` is never cached:
 * it renders while the real request is in flight and is replaced the moment it
 * resolves, and `isPlaceholderData` tells you which you're looking at. Paint
 * instantly, revalidate behind it.
 *
 * ## Serialization: superjson, and it is load-bearing
 *
 * A message row carries `createdAt` and `updatedAt` as real `Date`s, and the
 * chat row does:
 *
 *     isUpdated={message.updatedAt.getTime() !== message.createdAt.getTime()}
 *
 * A plain `JSON.stringify`/`parse` turns both into strings, so `.getTime()` is
 * `undefined` and that line throws on the first restored row — the snapshot
 * would break the very screen it exists to speed up. superjson round-trips
 * `Date` exactly, and it is already this app's tRPC transformer, so the snapshot
 * is stored in the same encoding the data arrived in. That also means a `Date`
 * added to this payload later needs no special handling here.
 */

type MessagesPage = inferRouterOutputs<AppRouter>["community"]["getMessages"];

/**
 * The `pageParam` type is `ExtractCursorType<input>` — the procedure's `cursor`
 * is `string | undefined`, and the first page's param is `undefined`.
 */
export type ChatSnapshot = InfiniteData<MessagesPage, string | undefined>;

const PREFIX = "watchparty.chat-snapshot.v1:";
/**
 * Bump when the page shape changes. An old snapshot of a different shape would
 * paint rows with missing fields — and because it is only ever placeholder
 * data, it would flicker into correctness a second later rather than failing
 * loudly, which is the worst way for this to break.
 */
const VERSION = 1;
/** Older than this and a "instant" paint is just a confidently wrong one. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Channels to keep. Past this the least recently saved is evicted. */
const MAX_CHANNELS = 8;
/** A single channel that serializes bigger than this is not worth the quota. */
const MAX_BYTES = 256 * 1024;

type Stored = {
    v: number;
    savedAt: number;
    page: MessagesPage;
};

function keyFor(channelId: string) {
    return PREFIX + channelId;
}

function storedKeys(): { key: string; savedAt: number }[] {
    const out: { key: string; savedAt: number }[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        // Parse only the timestamp — deserializing every snapshot to sort them
        // would be far more work than the eviction is worth.
        const raw = window.localStorage.getItem(key);
        const match = raw?.match(/"savedAt":(\d+)/);
        out.push({ key, savedAt: match ? Number(match[1]) : 0 });
    }
    return out.sort((a, b) => a.savedAt - b.savedAt);
}

function evictOldest(count: number) {
    for (const { key } of storedKeys().slice(0, count)) {
        try {
            window.localStorage.removeItem(key);
        } catch {
            // Nothing useful to do; the write below will fail open.
        }
    }
}

/**
 * The newest page for `channelId`, shaped for `placeholderData`, or `undefined`
 * when there's nothing usable. Never throws — a bad snapshot must degrade to
 * the normal loading state, not break the channel.
 */
export function readChatSnapshot(channelId: string): ChatSnapshot | undefined {
    if (typeof window === "undefined" || !channelId) return undefined;
    try {
        const raw = window.localStorage.getItem(keyFor(channelId));
        if (!raw) return undefined;

        const stored = superjson.parse<Stored>(raw);
        if (stored?.v !== VERSION) return undefined;
        if (!Number.isFinite(stored.savedAt) || Date.now() - stored.savedAt > MAX_AGE_MS) return undefined;
        if (!Array.isArray(stored.page?.items)) return undefined;

        // Structural sanity check on one row. The version guard above is the
        // real defence, but it only works if someone remembers to bump it, and
        // a snapshot is exactly the kind of thing that outlives the shape it
        // was written for.
        const first = stored.page.items[0];
        if (first && !(first.createdAt instanceof Date)) return undefined;

        return { pages: [stored.page], pageParams: [undefined] };
    } catch {
        return undefined;
    }
}

/**
 * Persist the newest page for `channelId`.
 *
 * Only page 0 is kept: it's what a channel opens on, and storing every page a
 * long session paged through would grow without bound for a screen that always
 * starts at the bottom anyway.
 */
export function writeChatSnapshot(channelId: string, data: ChatSnapshot | undefined): void {
    if (typeof window === "undefined" || !channelId) return;
    const page = data?.pages?.[0];
    if (!page?.items) return;

    // Never snapshot unconfirmed sends. An optimistic row is a local invention;
    // painting one back from storage would show a message that may never have
    // been sent, with no mutation in flight to ever resolve or roll it back.
    const items = page.items.filter(
        (m) => !m.id.startsWith("local-") && !(m as { pending?: boolean }).pending,
    );
    if (!items.length) return;

    const payload: Stored = { v: VERSION, savedAt: Date.now(), page: { ...page, items } };

    let raw: string;
    try {
        raw = superjson.stringify(payload);
    } catch {
        return;
    }
    if (raw.length > MAX_BYTES) return;

    const commit = () => window.localStorage.setItem(keyFor(channelId), raw);

    try {
        const existing = storedKeys();
        if (existing.length >= MAX_CHANNELS && !window.localStorage.getItem(keyFor(channelId))) {
            evictOldest(existing.length - MAX_CHANNELS + 1);
        }
        commit();
    } catch {
        // QuotaExceededError. Drop our own oldest entries and try once more —
        // this runs off a render, so it must never throw, and a snapshot that
        // fails to save costs nothing but the next paint.
        try {
            evictOldest(Math.ceil(MAX_CHANNELS / 2));
            commit();
        } catch {
            // Storage is full of something else, or private mode. Give up.
        }
    }
}

/** Drop one channel's snapshot. */
export function clearChatSnapshot(channelId: string): void {
    if (typeof window === "undefined" || !channelId) return;
    try {
        window.localStorage.removeItem(keyFor(channelId));
    } catch {
        // Nothing to do.
    }
}
