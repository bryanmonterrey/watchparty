import { describe, expect, test } from "bun:test";

import {
    GROUP_WINDOW_MS,
    isContinuation,
    withGroupFlags,
} from "@/lib/community/message-grouping";

/**
 * Grouping decides whether a row shows who sent it.
 *
 * That asymmetry drives every case below: a wrongly-GROUPED message hides its
 * author, which is a correctness problem in a chat log and can misattribute
 * speech. A wrongly-UNGROUPED one costs a little vertical space. So every
 * uncertain input must fall back to full chrome.
 */

const T0 = new Date("2026-08-09T12:00:00.000Z");
const at = (msAfter: number) => new Date(T0.getTime() + msAfter);

const msg = (over: Partial<Parameters<typeof isContinuation>[1]> = {}) => ({
    id: Math.random().toString(36).slice(2),
    userId: "alice",
    createdAt: T0,
    ...over,
});

describe("isContinuation", () => {
    test("the first message is never a continuation", () => {
        expect(isContinuation(undefined, msg())).toBe(false);
    });

    test("same author inside the window groups", () => {
        expect(isContinuation(msg(), msg({ createdAt: at(60_000) }))).toBe(true);
        expect(isContinuation(msg(), msg({ createdAt: at(GROUP_WINDOW_MS) }))).toBe(true);
    });

    test("one millisecond past the window does not", () => {
        expect(isContinuation(msg(), msg({ createdAt: at(GROUP_WINDOW_MS + 1) }))).toBe(false);
    });

    test("a different author never groups", () => {
        expect(isContinuation(msg(), msg({ userId: "bob", createdAt: at(1000) }))).toBe(false);
    });

    test("a missing author never groups", () => {
        // Webhooks and deleted-author rows both surface as an empty userId.
        // Grouping on "" would merge two different senders into one block.
        expect(isContinuation(msg({ userId: "" }), msg({ userId: "", createdAt: at(1000) }))).toBe(false);
        expect(isContinuation(msg({ userId: null }), msg({ userId: null, createdAt: at(1000) }))).toBe(false);
    });

    test("system notices never group, in either position", () => {
        expect(isContinuation(msg({ system: true }), msg({ createdAt: at(1000) }))).toBe(false);
        expect(isContinuation(msg(), msg({ system: true, createdAt: at(1000) }))).toBe(false);
    });

    test("a reply keeps its header", () => {
        // The quoted parent renders above the text; without the header that
        // quote looks like it belongs to whoever spoke last.
        expect(isContinuation(msg(), msg({ replyToId: "x", createdAt: at(1000) }))).toBe(false);
    });

    test("a pinned row keeps its header", () => {
        // Pinned means "find this while scanning". Stripping the avatar and name
        // to save a line defeats the reason it was pinned.
        expect(isContinuation(msg(), msg({ pinned: true, createdAt: at(1000) }))).toBe(false);
    });

    test("a day boundary breaks the group even inside the window", () => {
        const lateLastNight = new Date("2026-08-09T23:59:00.000Z");
        const justAfterMidnight = new Date("2026-08-10T00:01:00.000Z");
        expect(
            isContinuation(
                { id: "a", userId: "alice", createdAt: lateLastNight },
                { id: "b", userId: "alice", createdAt: justAfterMidnight },
            ),
        ).toBe(false);
    });

    test("out-of-order input refuses rather than grouping on a bad comparison", () => {
        expect(isContinuation(msg({ createdAt: at(60_000) }), msg({ createdAt: T0 }))).toBe(false);
    });

    test("an unparseable date refuses", () => {
        expect(isContinuation(msg(), msg({ createdAt: "not a date" }))).toBe(false);
    });

    test("ISO strings work as well as Dates — snapshots restore either", () => {
        expect(
            isContinuation(
                { id: "a", userId: "alice", createdAt: T0.toISOString() },
                { id: "b", userId: "alice", createdAt: at(1000).toISOString() },
            ),
        ).toBe(true);
    });
});

describe("withGroupFlags", () => {
    test("decorates a chronological run", () => {
        const rows = withGroupFlags([
            { id: "1", userId: "alice", createdAt: T0 },
            { id: "2", userId: "alice", createdAt: at(30_000) },
            { id: "3", userId: "bob", createdAt: at(60_000) },
            { id: "4", userId: "bob", createdAt: at(GROUP_WINDOW_MS * 2) },
        ]);

        expect(rows.map((r) => r.isContinuation)).toEqual([false, true, false, false]);
        // Only the first row of the day carries the divider.
        expect(rows.map((r) => r.isNewDay)).toEqual([true, false, false, false]);
    });

    test("keeps every original field", () => {
        const [row] = withGroupFlags([{ id: "1", userId: "alice", createdAt: T0, content: "hi" } as never]);
        expect((row as unknown as { content: string }).content).toBe("hi");
        expect(row.id).toBe("1");
    });

    test("an empty list is an empty list", () => {
        expect(withGroupFlags([])).toEqual([]);
    });

    test("a new day starts a divider and breaks the group", () => {
        const rows = withGroupFlags([
            { id: "1", userId: "alice", createdAt: new Date("2026-08-09T23:59:00.000Z") },
            { id: "2", userId: "alice", createdAt: new Date("2026-08-10T00:01:00.000Z") },
        ]);
        expect(rows[1].isNewDay).toBe(true);
        expect(rows[1].isContinuation).toBe(false);
    });
});
