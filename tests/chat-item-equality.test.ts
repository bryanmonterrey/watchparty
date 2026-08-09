import { describe, expect, test } from "bun:test";

import {
    chatItemPropsEqual,
    reactionsEqual,
    replyToEqual,
} from "@/components/community/community-chat-item-equality";

describe("reactionsEqual", () => {
    test("same contents, different array identity → equal", () => {
        expect(
            reactionsEqual(
                [{ emoji: "👍", count: 2, reactedByMe: false }],
                [{ emoji: "👍", count: 2, reactedByMe: false }],
            ),
        ).toBe(true);
    });

    test("count change → not equal", () => {
        expect(
            reactionsEqual(
                [{ emoji: "👍", count: 2, reactedByMe: false }],
                [{ emoji: "👍", count: 3, reactedByMe: false }],
            ),
        ).toBe(false);
    });

    test("reactedByMe flip → not equal (the chip's own highlight)", () => {
        expect(
            reactionsEqual(
                [{ emoji: "👍", count: 2, reactedByMe: false }],
                [{ emoji: "👍", count: 2, reactedByMe: true }],
            ),
        ).toBe(false);
    });

    test("length change → not equal", () => {
        expect(
            reactionsEqual([], [{ emoji: "👍", count: 1, reactedByMe: true }]),
        ).toBe(false);
    });

    test("undefined on one side → not equal", () => {
        expect(reactionsEqual(undefined, [])).toBe(false);
    });
});

describe("replyToEqual", () => {
    const reply = { userName: "ada", content: "hi", deleted: false };

    test("same contents, different object identity → equal", () => {
        expect(replyToEqual({ ...reply }, { ...reply })).toBe(true);
    });

    test("null on both sides → equal", () => {
        expect(replyToEqual(null, null)).toBe(true);
    });

    test("null vs object → not equal", () => {
        expect(replyToEqual(null, { ...reply })).toBe(false);
    });

    test("deleted flip → not equal", () => {
        expect(replyToEqual(reply, { ...reply, deleted: true })).toBe(false);
    });
});

describe("chatItemPropsEqual", () => {
    // The realistic case: a refetch hands back equal values in fresh objects.
    const base = {
        id: "m1",
        content: "hello",
        userName: "ada",
        reactions: [{ emoji: "👍", count: 1, reactedByMe: false }],
        replyTo: { userName: "bob", content: "yo", deleted: false },
        emojiMap: { party: "https://x/party.png" },
    };

    test("a refetch that changed nothing → bails (the whole point)", () => {
        const next = {
            ...base,
            reactions: [{ emoji: "👍", count: 1, reactedByMe: false }],
            replyTo: { userName: "bob", content: "yo", deleted: false },
        };
        expect(chatItemPropsEqual(base, next)).toBe(true);
    });

    test("edited content → re-renders", () => {
        expect(chatItemPropsEqual(base, { ...base, content: "edited" })).toBe(false);
    });

    test("new reaction → re-renders", () => {
        expect(
            chatItemPropsEqual(base, {
                ...base,
                reactions: [{ emoji: "👍", count: 2, reactedByMe: true }],
            }),
        ).toBe(false);
    });

    test("a NEW emojiMap identity re-renders — it must stay useMemo'd upstream", () => {
        expect(
            chatItemPropsEqual(base, { ...base, emojiMap: { ...base.emojiMap } }),
        ).toBe(false);
    });

    test("a prop added later is compared by default, not silently ignored", () => {
        const withExtra = { ...base, brandNewProp: 1 };
        expect(chatItemPropsEqual(withExtra, { ...withExtra, brandNewProp: 2 })).toBe(false);
    });

    test("differing key counts → not equal", () => {
        expect(chatItemPropsEqual(base, { ...base, extra: true })).toBe(false);
    });
});
