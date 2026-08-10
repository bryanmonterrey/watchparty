import { afterEach, beforeEach, describe, expect, test } from "bun:test";

/**
 * The generic snapshot store, extracted from the chat one.
 *
 * `tests/chat-snapshot.test.ts` still covers the chat-specific contract
 * (optimistic rows, `Date` survival) end to end. What's tested here is what
 * only became possible once several surfaces shared one localStorage: that a
 * store evicts its OWN entries and nobody else's, and that sign-out can wipe
 * every store including ones this module never imported.
 */

class MemoryStorage {
    private map = new Map<string, string>();
    /** When set, `setItem` throws like a browser at quota. */
    limit = Infinity;

    get length() {
        return this.map.size;
    }
    key(i: number) {
        return [...this.map.keys()][i] ?? null;
    }
    getItem(k: string) {
        return this.map.get(k) ?? null;
    }
    setItem(k: string, v: string) {
        if (this.map.size >= this.limit && !this.map.has(k)) {
            const err = new Error("QuotaExceededError");
            err.name = "QuotaExceededError";
            throw err;
        }
        this.map.set(k, v);
    }
    removeItem(k: string) {
        this.map.delete(k);
    }
}

let storage: MemoryStorage;

beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as any).window = { localStorage: storage };
});

afterEach(() => {
    delete (globalThis as any).window;
});

const { createSnapshotStore, clearAllSnapshots } = await import("@/lib/snapshot/store");
const { createInfiniteSnapshotStore } = await import("@/lib/snapshot/infinite");
const { viewerKey, privateViewerKey } = await import("@/lib/snapshot/keys");

type Row = { id: string; at: Date };

function makeStore(over: Partial<Parameters<typeof createSnapshotStore<Row[]>>[0]> = {}) {
    return createSnapshotStore<Row[]>({
        prefix: "test.a:",
        version: 1,
        maxEntries: 3,
        ...over,
    });
}

const row = (id: string) => ({ id, at: new Date(Date.UTC(2026, 7, 10, 12)) });

describe("snapshot store", () => {
    test("round-trips Date fields as Dates, not strings", () => {
        const store = makeStore();
        store.write("k", [row("a")]);

        const back = store.read("k")!;
        expect(back[0].at).toBeInstanceOf(Date);
        // The whole reason superjson is here: this is the call that throws on a
        // string, and tsc cannot see the difference.
        expect(back[0].at.getTime()).toBe(Date.UTC(2026, 7, 10, 12));
    });

    test("a superseded version reads as undefined AND is removed", () => {
        makeStore().write("k", [row("a")]);
        expect(storage.length).toBe(1);

        // A newer build with a bumped version.
        const bumped = makeStore({ version: 2 });
        expect(bumped.read("k")).toBeUndefined();
        // Dead weight: it can never be painted again, so it must not sit there
        // holding quota until LRU happens to reach it.
        expect(storage.length).toBe(0);
    });

    test("a stale entry is ignored rather than painted", () => {
        const store = makeStore({ maxAgeMs: 1_000 });
        store.write("k", [row("a")]);
        const raw = storage.getItem("test.a:k")!;
        storage.setItem("test.a:k", raw.replace(/"savedAt":\d+/, `"savedAt":${Date.now() - 5_000}`));

        expect(store.read("k")).toBeUndefined();
    });

    test("validate rejects a structurally wrong payload", () => {
        const store = makeStore({ validate: (v) => Array.isArray(v) && v.length > 1 });
        store.write("k", [row("a")]);
        expect(store.read("k")).toBeUndefined();
    });

    test("sanitize can refuse to store anything", () => {
        const store = makeStore({ sanitize: (v) => v.filter((r) => r.id !== "skip"), });
        store.write("k", [row("skip")]);
        // An empty array still stores; it is the caller's job to return null.
        expect(store.read("k")).toEqual([]);

        const strict = makeStore({ prefix: "test.strict:", sanitize: () => null });
        strict.write("k", [row("a")]);
        expect(strict.read("k")).toBeUndefined();
    });

    test("evicts its least recently saved entry past the cap", () => {
        const store = makeStore(); // cap 3
        const now = Date.now();
        for (let i = 0; i < 4; i++) {
            store.write(`k${i}`, [row(`m${i}`)]);
            const raw = storage.getItem(`test.a:k${i}`);
            // savedAt has millisecond resolution and these writes are faster
            // than that, so nudge them apart to make "oldest" well-defined.
            // They must stay RECENT: rewriting to small absolute numbers dates
            // everything to 1970 and the staleness guard drops all four, which
            // reads as "eviction worked" for entirely the wrong reason.
            if (raw) storage.setItem(`test.a:k${i}`, raw.replace(/"savedAt":\d+/, `"savedAt":${now - (4 - i) * 1000}`));
        }

        expect(storage.length).toBe(3);
        expect(store.read("k0")).toBeUndefined();
        expect(store.read("k3")).toBeDefined();
    });

    test("one store's cap never evicts another store's entries", () => {
        // The reason this matters: before the extraction there was exactly one
        // store, so "the cap" and "everything we wrote" were the same set. Now
        // the feed, chat, notifications and the rails all share localStorage,
        // and a busy feed must not silently evict your chat snapshots.
        const a = makeStore({ prefix: "test.a:", maxEntries: 2 });
        const b = makeStore({ prefix: "test.b:", maxEntries: 2 });

        b.write("keep-1", [row("b1")]);
        b.write("keep-2", [row("b2")]);
        for (let i = 0; i < 5; i++) a.write(`churn-${i}`, [row(`a${i}`)]);

        expect(b.read("keep-1")).toBeDefined();
        expect(b.read("keep-2")).toBeDefined();
    });

    test("a quota error degrades instead of throwing", () => {
        const store = makeStore();
        storage.limit = 0;
        expect(() => store.write("k", [row("a")])).not.toThrow();
        expect(store.read("k")).toBeUndefined();
    });

    test("an empty key neither reads nor writes", () => {
        // privateViewerKey returns "" when signed out, and that must be inert
        // rather than writing an `anon` snapshot of a protected list.
        const store = makeStore();
        store.write("", [row("a")]);
        expect(storage.length).toBe(0);
        expect(store.read("")).toBeUndefined();
    });

    test("missing and corrupt entries read as undefined", () => {
        const store = makeStore();
        expect(store.read("never-seen")).toBeUndefined();
        storage.setItem("test.a:k", "{not json");
        expect(store.read("k")).toBeUndefined();
    });

    test("clearAll drops only this store", () => {
        const a = makeStore({ prefix: "test.a:" });
        const b = makeStore({ prefix: "test.b:" });
        a.write("k", [row("a")]);
        b.write("k", [row("b")]);

        a.clearAll();
        expect(a.read("k")).toBeUndefined();
        expect(b.read("k")).toBeDefined();
    });

    test("clearAllSnapshots wipes every registered store, and the legacy chat prefix", () => {
        makeStore({ prefix: "test.a:" }).write("k", [row("a")]);
        makeStore({ prefix: "test.b:" }).write("k", [row("b")]);
        // Written by an older build under a prefix no live store uses.
        storage.setItem("watchparty.chat-snapshot.v1:chan-1", "whatever");
        // Something that isn't ours must survive — this runs on sign-out, not
        // a factory reset.
        storage.setItem("theme", "dark");

        clearAllSnapshots();

        expect(storage.getItem("test.a:k")).toBeNull();
        expect(storage.getItem("test.b:k")).toBeNull();
        expect(storage.getItem("watchparty.chat-snapshot.v1:chan-1")).toBeNull();
        expect(storage.getItem("theme")).toBe("dark");
    });
});

describe("infinite snapshot store", () => {
    type Page = { items: Row[]; nextCursor?: string };

    const store = createInfiniteSnapshotStore<Page, string | undefined>({
        prefix: "test.inf:",
        version: 1,
        maxEntries: 3,
    });

    test("restores exactly the shape placeholderData needs", () => {
        store.write("k", { pages: [{ items: [row("a")], nextCursor: "c1" }], pageParams: [undefined] });

        const back = store.read("k")!;
        expect(back.pages).toHaveLength(1);
        expect(back.pageParams).toEqual([undefined]);
        expect(back.pages[0].nextCursor).toBe("c1");
        expect(back.pages[0].items[0].at).toBeInstanceOf(Date);
    });

    test("stores only page 0, however far the session scrolled", () => {
        store.write("deep", {
            pages: [{ items: [row("p0")] }, { items: [row("p1")] }, { items: [row("p2")] }],
            pageParams: [undefined, "c1", "c2"],
        });

        const back = store.read("deep")!;
        // Restoring later pages would also restore cursors minted against a
        // previous session's server state, which fetchNextPage would then
        // continue from.
        expect(back.pages).toHaveLength(1);
        expect(back.pages[0].items[0].id).toBe("p0");
        expect(back.pageParams).toEqual([undefined]);
    });

    test("undefined data writes nothing", () => {
        store.write("empty", undefined);
        expect(store.read("empty")).toBeUndefined();
    });
});

describe("snapshot keys", () => {
    test("viewerKey buckets signed-out separately from any account", () => {
        expect(viewerKey("user-1", "feed", "forYou")).toBe("user-1:feed:forYou");
        expect(viewerKey(null, "feed", "forYou")).toBe("anon:feed:forYou");
        // The point: one can never be read as the other.
        expect(viewerKey("user-1", "feed")).not.toBe(viewerKey("user-2", "feed"));
    });

    test("privateViewerKey refuses to key anything when signed out", () => {
        expect(privateViewerKey("user-1", "bookmarks")).toBe("user-1:bookmarks");
        // "" is inert in every store, so a signed-out render can neither read
        // nor write a protected surface.
        expect(privateViewerKey(null, "bookmarks")).toBe("");
        expect(privateViewerKey(undefined, "bookmarks")).toBe("");
    });
});
