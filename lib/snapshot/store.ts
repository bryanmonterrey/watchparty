import superjson from "superjson";

/**
 * Paint-instantly snapshots, generalised.
 *
 * `lib/community/chat-snapshot.ts` proved the shape: mirror a query's newest
 * page into localStorage, hand it to `placeholderData` on the next visit, and
 * revalidate behind it. Everything in that file except the message type was
 * generic — versioning, staleness, LRU eviction, the byte cap, the quota
 * retry — so it lives here now and each surface declares its own store.
 *
 * ## Why each surface owns its own `version`
 *
 * A snapshot outlives the code that wrote it, by design. When a payload's shape
 * changes, old entries must stop being painted — and because they are only ever
 * *placeholder* data, a stale shape doesn't fail loudly: it renders rows with
 * missing fields and then flickers into correctness a second later. That is the
 * worst way for this to break, so `version` is the guard, and it is per-store.
 * One shared version would mean a change to the feed row silently invalidating
 * every chat channel, notification list and bookmark page at the same time.
 *
 * ## superjson, and it is load-bearing
 *
 * Every payload here carries real `Date`s, and consumers call methods on them
 * (`community-chat-messages` does `updatedAt.getTime() !== createdAt.getTime()`;
 * feed rows drive `formatDistanceToNow`). `JSON.parse` returns strings, so the
 * first restored row throws and the cache built to make a screen faster is the
 * thing that breaks it. superjson round-trips `Date` exactly and is already
 * this app's tRPC transformer, so a snapshot is stored in the same encoding the
 * data arrived in — a `Date` added to a payload later needs no work here.
 *
 * ## Never throws
 *
 * Reads and writes run off render and off `pagehide`. A corrupt entry, a
 * disabled storage API or a full disk must degrade to "no snapshot", never to a
 * broken screen. Every path here is wrapped.
 */

/** Envelope written to storage. `v` and `savedAt` stay top-level so eviction can read `savedAt` without deserializing the payload. */
type Envelope<T> = {
    v: number;
    savedAt: number;
    value: T;
};

export interface SnapshotStore<T> {
    /** The stored value for `key`, or `undefined` when there is nothing usable. */
    read(key: string): T | undefined;
    /** Persist `value` under `key`, evicting our own oldest entries if needed. */
    write(key: string, value: T): void;
    /** Drop one entry. */
    clear(key: string): void;
    /** Drop every entry belonging to this store. */
    clearAll(): void;
}

export interface SnapshotStoreOptions<T> {
    /**
     * localStorage key prefix, unique per store and STABLE across versions.
     * Putting the version in the prefix instead would orphan old entries: the
     * scanner only sees its own prefix, so superseded ones would never be read
     * and never be evicted — they'd just sit there holding quota forever.
     */
    prefix: string;
    /** Bump when the payload shape changes. See the note above. */
    version: number;
    /** Entries to keep. Past this the least recently saved is evicted. */
    maxEntries: number;
    /** A single entry serializing larger than this isn't worth the quota. */
    maxBytes?: number;
    /** Older than this and an "instant" paint is just a confidently wrong one. */
    maxAgeMs?: number;
    /**
     * Structural check on a decoded payload. The `version` guard is the real
     * defence, but it only works if someone remembers to bump it — and a
     * snapshot is exactly the kind of thing that outlives the shape it was
     * written for. Cheap assertions only (is this an array, is this a `Date`).
     */
    validate?: (value: T) => boolean;
    /**
     * Last chance to drop or rewrite a payload before it is stored. Return
     * `null` to store nothing. Used to strip optimistic rows, which are local
     * inventions with no server row behind them.
     */
    sanitize?: (value: T) => T | null;
}

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Every prefix handed to `createSnapshotStore`, so `clearAllSnapshots` can wipe
 * stores it was never told about. A module that is never imported never
 * registers — which is fine, because a store nobody imports also never wrote
 * anything. Legacy prefixes are seeded below.
 */
const registeredPrefixes = new Set<string>();

/**
 * Prefixes no live store writes to any more, kept so a sign-out still clears
 * what older builds left behind. Entries under a prefix nobody scans are
 * invisible AND immortal, so dropping a prefix without listing it here leaks
 * quota in every browser that ever ran the old build.
 */
const LEGACY_PREFIXES = ["watchparty.chat-snapshot.v1:"];

function hasStorage(): boolean {
    return typeof window !== "undefined" && !!window.localStorage;
}

export function createSnapshotStore<T>(opts: SnapshotStoreOptions<T>): SnapshotStore<T> {
    const {
        prefix,
        version,
        maxEntries,
        maxBytes = DEFAULT_MAX_BYTES,
        maxAgeMs = DEFAULT_MAX_AGE_MS,
        validate,
        sanitize,
    } = opts;

    registeredPrefixes.add(prefix);

    const keyFor = (key: string) => prefix + key;

    /** Our own keys, oldest first. */
    function storedKeys(): { key: string; savedAt: number }[] {
        const out: { key: string; savedAt: number }[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (!k?.startsWith(prefix)) continue;
            // Parse only the timestamp. Deserializing every snapshot to sort
            // them would cost far more than the eviction saves.
            const raw = window.localStorage.getItem(k);
            const match = raw?.match(/"savedAt":(\d+)/);
            out.push({ key: k, savedAt: match ? Number(match[1]) : 0 });
        }
        return out.sort((a, b) => a.savedAt - b.savedAt);
    }

    function evictOldest(count: number) {
        for (const { key } of storedKeys().slice(0, count)) {
            try {
                window.localStorage.removeItem(key);
            } catch {
                // Nothing useful to do; the caller fails open.
            }
        }
    }

    function read(key: string): T | undefined {
        if (!hasStorage() || !key) return undefined;
        try {
            const raw = window.localStorage.getItem(keyFor(key));
            if (!raw) return undefined;

            const stored = superjson.parse<Envelope<T>>(raw);

            // A superseded version is dead weight: it will never be painted, so
            // remove it now rather than waiting for LRU to reach it.
            if (stored?.v !== version) {
                clear(key);
                return undefined;
            }
            if (!Number.isFinite(stored.savedAt) || Date.now() - stored.savedAt > maxAgeMs) return undefined;
            if (stored.value == null) return undefined;
            if (validate && !validate(stored.value)) return undefined;

            return stored.value;
        } catch {
            return undefined;
        }
    }

    function write(key: string, value: T): void {
        if (!hasStorage() || !key || value == null) return;

        const cleaned = sanitize ? sanitize(value) : value;
        if (cleaned == null) return;

        let raw: string;
        try {
            raw = superjson.stringify({ v: version, savedAt: Date.now(), value: cleaned } satisfies Envelope<T>);
        } catch {
            // Something in the payload isn't serializable. Storing a partial
            // snapshot would paint a broken row, so store nothing.
            return;
        }
        if (raw.length > maxBytes) return;

        const commit = () => window.localStorage.setItem(keyFor(key), raw);

        try {
            const existing = storedKeys();
            if (existing.length >= maxEntries && !window.localStorage.getItem(keyFor(key))) {
                evictOldest(existing.length - maxEntries + 1);
            }
            commit();
        } catch {
            // QuotaExceededError. Drop our own oldest and try once more — this
            // runs off a render, so it must never throw, and a snapshot that
            // fails to save costs nothing but the next paint.
            try {
                evictOldest(Math.ceil(maxEntries / 2));
                commit();
            } catch {
                // Storage is full of something else, or private mode. Give up.
            }
        }
    }

    function clear(key: string): void {
        if (!hasStorage() || !key) return;
        try {
            window.localStorage.removeItem(keyFor(key));
        } catch {
            // Nothing to do.
        }
    }

    function clearAll(): void {
        if (!hasStorage()) return;
        try {
            for (const { key } of storedKeys()) window.localStorage.removeItem(key);
        } catch {
            // Nothing to do.
        }
    }

    return { read, write, clear, clearAll };
}

/**
 * Wipe every snapshot this app has written.
 *
 * Call on sign-out. Snapshots of viewer-dependent surfaces — a feed carrying
 * your own `isLiked` flags, your notifications, your bookmarks — are keyed by
 * viewer id so the next account can never be painted with them, but keying
 * alone still leaves the previous account's content sitting in localStorage
 * after they log out. On a shared machine that is the whole problem.
 */
export function clearAllSnapshots(): void {
    if (!hasStorage()) return;
    const prefixes = [...registeredPrefixes, ...LEGACY_PREFIXES];
    try {
        const doomed: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && prefixes.some((p) => k.startsWith(p))) doomed.push(k);
        }
        // Collected first: removing while iterating by index skips entries.
        for (const k of doomed) window.localStorage.removeItem(k);
    } catch {
        // Nothing to do.
    }
}
