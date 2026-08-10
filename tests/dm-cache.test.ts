import { describe, expect, test } from "bun:test";
import type { InfiniteData } from "@tanstack/react-query";

import {
    appendDmMessage,
    flattenDmMessages,
    mapDmMessages,
} from "@/lib/messages/dm-cache";

/**
 * DMs went from one cached page to `{ pages, pageParams }` so history past the
 * newest 50 is reachable.
 *
 * Everything here is really one assertion: **the two ordering axes run
 * opposite ways.** Pages arrive newest-batch-first, but each page is reversed
 * server-side into reading order. Flattening `pages` naively renders the newest
 * 50 messages ABOVE older history, and it only shows up once a conversation is
 * long enough to have a second page — i.e. never in a fresh test account, and
 * always for the people with the most history.
 */

const msg = (id: string) => ({ id });

type TestPage = { messages: { id: string; [k: string]: unknown }[]; nextCursor?: string };
type TestData = InfiniteData<TestPage, string | undefined>;

const data = (...pages: TestPage[]): TestData =>
    ({ pages, pageParams: pages.map((_, i) => (i === 0 ? undefined : `cursor-${i}`)) }) as TestData;

// Page 0 is the NEWEST batch; within a page, oldest first.
const twoPages = () =>
    data(
        { messages: [msg("new-1"), msg("new-2")], nextCursor: "c1" },
        { messages: [msg("old-1"), msg("old-2")] },
    );

describe("flattenDmMessages", () => {
    test("returns reading order: oldest batch first, newest message last", () => {
        expect(flattenDmMessages(twoPages()).map((m) => m.id)).toEqual([
            "old-1",
            "old-2",
            "new-1",
            "new-2",
        ]);
    });

    test("a single page is already in reading order", () => {
        const d = data({ messages: [msg("a"), msg("b")] });
        expect(flattenDmMessages(d).map((m) => m.id)).toEqual(["a", "b"]);
    });

    test("three pages keep walking backwards correctly", () => {
        const d = data({ messages: [msg("c")] }, { messages: [msg("b")] }, { messages: [msg("a")] });
        expect(flattenDmMessages(d).map((m) => m.id)).toEqual(["a", "b", "c"]);
    });

    test("an unloaded cache is a stable empty array, not a new one each call", () => {
        // Consumers put this in dependency arrays; a fresh [] every render would
        // re-run decryption of the whole conversation on every render.
        expect(flattenDmMessages(undefined)).toEqual([]);
        expect(flattenDmMessages(undefined)).toBe(flattenDmMessages(undefined));
    });

    test("survives a malformed page instead of throwing", () => {
        const d = { pages: [undefined, { messages: [msg("a")] }], pageParams: [undefined, "c"] } as unknown as TestData;
        expect(flattenDmMessages(d).map((m) => m.id)).toEqual(["a"]);
    });
});

describe("mapDmMessages", () => {
    test("patches a message on ANY page, not just the newest", () => {
        // A reaction toggle knows an id, not a page — and a row moves between
        // pages as older history loads.
        const out = mapDmMessages(twoPages(), (m) =>
            m.id === "old-2" ? { ...m, reactions: ["👍"] } : m,
        )!;
        expect(out.pages[1].messages[1].reactions).toEqual(["👍"]);
    });

    test("leaves untouched rows identical, so memoized rows can still bail", () => {
        const d = twoPages();
        const out = mapDmMessages(d, (m) => (m.id === "new-1" ? { ...m, x: 1 } : m))!;
        expect(out.pages[1].messages[0]).toBe(d.pages[1].messages[0]);
    });

    test("preserves page count, order and cursors", () => {
        const d = twoPages();
        const out = mapDmMessages(d, (m) => m)!;
        expect(out.pages).toHaveLength(2);
        expect(out.pages[0].nextCursor).toBe("c1");
        expect(out.pageParams).toEqual(d.pageParams);
    });

    test("an unloaded cache passes straight through", () => {
        expect(mapDmMessages(undefined, (m) => m)).toBeUndefined();
    });
});

describe("appendDmMessage", () => {
    test("a sent message lands at the BOTTOM of the conversation", () => {
        const out = appendDmMessage(twoPages(), msg("optimistic-1"))!;
        expect(flattenDmMessages(out).map((m) => m.id)).toEqual([
            "old-1",
            "old-2",
            "new-1",
            "new-2",
            "optimistic-1",
        ]);
    });

    test("does not touch older pages", () => {
        const d = twoPages();
        const out = appendDmMessage(d, msg("x"))!;
        expect(out.pages[1]).toBe(d.pages[1]);
    });

    test("refuses to invent a page when nothing is cached", () => {
        // Writing one here would create an entry the query never fetched; the
        // real fetch would replace it and the message would flicker.
        expect(appendDmMessage(undefined, msg("x"))).toBeUndefined();
        const empty = { pages: [], pageParams: [] } as unknown as TestData;
        expect(appendDmMessage(empty, msg("x"))).toBe(empty);
    });
});
