import { afterEach, beforeEach, describe, expect, test } from "bun:test";

/**
 * The snapshot's whole job is to survive a trip through storage unchanged.
 *
 * The bug this guards against is specific and silent: chat rows carry
 * `createdAt`/`updatedAt` as real `Date`s, and `community-chat-messages.tsx`
 * does `message.updatedAt.getTime() !== message.createdAt.getTime()`. Under a
 * plain `JSON.stringify`/`parse` those become strings, `.getTime()` is
 * `undefined`, and the first restored row throws — so the cache built to make
 * the channel faster would be the thing that breaks it. Nothing in tsc sees
 * this: the stored type says `Date` either way.
 */

// A localStorage stand-in. bun's runner has no DOM, and the module reads
// `window.localStorage` directly (it is client-only by construction).
class MemoryStorage {
    private map = new Map<string, string>();
    /** When set, `setItem` throws like a browser at quota — the path that must degrade, not throw. */
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

// Imported after the window stub exists — the module reads `typeof window` per
// call, not at import time, but keeping the order explicit documents that.
const { readChatSnapshot, writeChatSnapshot, clearChatSnapshot } = await import(
    "@/lib/community/chat-snapshot"
);

function message(id: string, opts: { edited?: boolean; pending?: boolean } = {}) {
    const createdAt = new Date(Date.UTC(2026, 7, 9, 12, 0, 0));
    return {
        id,
        content: `message ${id}`,
        createdAt,
        updatedAt: opts.edited ? new Date(createdAt.getTime() + 5_000) : createdAt,
        pending: opts.pending,
    };
}

function snapshotOf(items: ReturnType<typeof message>[], nextCursor?: string) {
    return { pages: [{ items, nextCursor }], pageParams: [undefined] } as any;
}

describe("chat snapshot", () => {
    test("round-trips Date fields as Dates, not strings", () => {
        writeChatSnapshot("chan-1", snapshotOf([message("a"), message("b", { edited: true })]));

        const restored = readChatSnapshot("chan-1");
        const items = restored!.pages[0].items as any[];

        expect(items[0].createdAt).toBeInstanceOf(Date);
        expect(items[0].updatedAt).toBeInstanceOf(Date);

        // The exact expression the chat row evaluates. Under JSON this throws.
        expect(items[0].updatedAt.getTime() !== items[0].createdAt.getTime()).toBe(false);
        expect(items[1].updatedAt.getTime() !== items[1].createdAt.getTime()).toBe(true);
    });

    test("restores the shape placeholderData needs", () => {
        writeChatSnapshot("chan-1", snapshotOf([message("a")], "cursor-1"));

        const restored = readChatSnapshot("chan-1")!;
        expect(restored.pages).toHaveLength(1);
        // One page means one page param, and the newest page's param is
        // undefined — a mismatched length desynchronises fetchNextPage.
        expect(restored.pageParams).toEqual([undefined]);
        expect(restored.pages[0].nextCursor).toBe("cursor-1");
    });

    test("never persists optimistic rows", () => {
        writeChatSnapshot(
            "chan-1",
            snapshotOf([message("local-123"), message("real"), message("p", { pending: true })]),
        );

        const items = readChatSnapshot("chan-1")!.pages[0].items as any[];
        expect(items.map((m) => m.id)).toEqual(["real"]);
    });

    test("a page of only optimistic rows writes nothing at all", () => {
        writeChatSnapshot("chan-1", snapshotOf([message("local-1"), message("local-2")]));
        expect(readChatSnapshot("chan-1")).toBeUndefined();
    });

    test("missing, empty and corrupt entries read as undefined", () => {
        expect(readChatSnapshot("never-seen")).toBeUndefined();

        storage.setItem("watchparty.chat-snapshot.v1:chan-1", "{not json");
        expect(readChatSnapshot("chan-1")).toBeUndefined();
    });

    test("a snapshot written under an older version is ignored", () => {
        writeChatSnapshot("chan-1", snapshotOf([message("a")]));
        const raw = storage.getItem("watchparty.chat-snapshot.v1:chan-1")!;
        storage.setItem("watchparty.chat-snapshot.v1:chan-1", raw.replace('"v":1', '"v":0'));

        expect(readChatSnapshot("chan-1")).toBeUndefined();
    });

    test("a stale snapshot is ignored rather than painted", () => {
        writeChatSnapshot("chan-1", snapshotOf([message("a")]));
        const raw = storage.getItem("watchparty.chat-snapshot.v1:chan-1")!;
        const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
        storage.setItem(
            "watchparty.chat-snapshot.v1:chan-1",
            raw.replace(/"savedAt":\d+/, `"savedAt":${old}`),
        );

        expect(readChatSnapshot("chan-1")).toBeUndefined();
    });

    test("evicts the least recently saved channel past the cap", () => {
        // 9 channels against a cap of 8. savedAt has millisecond resolution and
        // these writes are faster than that, so the timestamps are nudged apart
        // to make "oldest" well-defined instead of insertion-order luck. They
        // must stay RECENT while doing it — rewriting them to small absolute
        // numbers dates every entry to 1970, and the staleness guard then drops
        // all nine, which reads as "eviction worked" for entirely the wrong
        // reason.
        const now = Date.now();
        for (let i = 0; i < 9; i++) {
            writeChatSnapshot(`chan-${i}`, snapshotOf([message(`m${i}`)]));
            const key = `watchparty.chat-snapshot.v1:chan-${i}`;
            const raw = storage.getItem(key);
            if (raw) {
                storage.setItem(key, raw.replace(/"savedAt":\d+/, `"savedAt":${now - (9 - i) * 1000}`));
            }
        }

        expect(storage.length).toBeLessThanOrEqual(8);
        expect(readChatSnapshot("chan-0")).toBeUndefined();
        expect(readChatSnapshot("chan-8")).toBeDefined();
    });

    test("a quota error degrades instead of throwing", () => {
        storage.limit = 0;
        expect(() => writeChatSnapshot("chan-1", snapshotOf([message("a")]))).not.toThrow();
        expect(readChatSnapshot("chan-1")).toBeUndefined();
    });

    test("clear removes one channel and leaves the rest", () => {
        writeChatSnapshot("chan-1", snapshotOf([message("a")]));
        writeChatSnapshot("chan-2", snapshotOf([message("b")]));

        clearChatSnapshot("chan-1");
        expect(readChatSnapshot("chan-1")).toBeUndefined();
        expect(readChatSnapshot("chan-2")).toBeDefined();
    });
});
