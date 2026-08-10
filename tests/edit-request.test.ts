import { describe, expect, test } from "bun:test";

import { findLastOwnMessageId } from "@/lib/community/edit-request";

/**
 * ↑ is a BLIND keystroke — the user isn't looking at what it will select, and
 * the editor opens on whatever it picks. So picking the wrong message is much
 * worse than picking none, and nearly every case here is a refusal.
 */

const page = (...items: Parameters<typeof findLastOwnMessageId>[0] extends undefined ? never[] : { id: string; userId?: string | null; deleted?: boolean; system?: boolean; isWebhook?: boolean }[]) => ({ items });
const ME = "me";

describe("findLastOwnMessageId", () => {
    test("picks my newest message, scanning newest-first", () => {
        const pages = [page({ id: "c", userId: "bob" }, { id: "b", userId: ME }, { id: "a", userId: ME })];
        expect(findLastOwnMessageId(pages, ME)).toBe("b");
    });

    test("falls through to an older page when the newest holds none of mine", () => {
        const pages = [page({ id: "c", userId: "bob" }), page({ id: "b", userId: ME })];
        expect(findLastOwnMessageId(pages, ME)).toBe("b");
    });

    test("skips deleted, system and webhook rows", () => {
        const pages = [page(
            { id: "d", userId: ME, deleted: true },
            { id: "c", userId: ME, system: true },
            { id: "b", userId: ME, isWebhook: true },
            { id: "a", userId: ME },
        )];
        // A webhook row can carry your name and is still posted by an app.
        expect(findLastOwnMessageId(pages, ME)).toBe("a");
    });

    test("REFUSES an optimistic row — there is no server message to edit yet", () => {
        const pages = [page({ id: "local-123", userId: ME }, { id: "real", userId: ME })];
        expect(findLastOwnMessageId(pages, ME)).toBe("real");
    });

    test("returns null rather than guessing", () => {
        expect(findLastOwnMessageId(undefined, ME)).toBeNull();
        expect(findLastOwnMessageId([], ME)).toBeNull();
        expect(findLastOwnMessageId([page({ id: "a", userId: "bob" })], ME)).toBeNull();
        // No signed-in user: never match a row with a null author.
        expect(findLastOwnMessageId([page({ id: "a", userId: null })], null)).toBeNull();
        expect(findLastOwnMessageId([page({ id: "a", userId: null })], ME)).toBeNull();
    });

    test("an empty page doesn't stop the scan", () => {
        const pages = [{ items: [] }, page({ id: "b", userId: ME })];
        expect(findLastOwnMessageId(pages, ME)).toBe("b");
    });
});
