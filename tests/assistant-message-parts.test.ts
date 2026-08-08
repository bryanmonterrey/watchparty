import { describe, expect, test } from "bun:test";
import {
    textOf,
    isThinking,
    pendingToolLabels,
    streamKeyCards,
    pendingApprovals,
} from "@/components/ai/message-parts";
import type { UIMessage } from "ai";

// These three functions ARE the assistant's render path. When `textOf` returns
// "", the chat shows an empty bubble — the exact symptom that shipped eight
// times undetected, because tsc and CI cannot see whether text reaches a
// screen. Cheap tests, pinned against the real part shapes the AI SDK emits.

const msg = (parts: unknown[]): UIMessage =>
    ({ id: "m1", role: "assistant", parts } as unknown as UIMessage);

const text = (t: string, state = "done") => ({ type: "text", text: t, state });
const reasoning = (t: string) => ({ type: "reasoning", text: t, state: "streaming" });
const tool = (name: string, state: string) => ({ type: `tool-${name}`, state, toolCallId: "c1" });

describe("textOf", () => {
    test("returns the text of a simple answer", () => {
        expect(textOf(msg([text("hello there")]))).toBe("hello there");
    });

    // Streaming produces many text parts; taking [0] would render the first
    // token and drop the rest.
    test("JOINS multiple text parts rather than taking the first", () => {
        expect(textOf(msg([text("hel"), text("lo "), text("world")]))).toBe("hello world");
    });

    // The reasoning model interleaves. Reasoning must never leak into the
    // rendered answer — it's a scratchpad that contradicts itself mid-stream.
    test("excludes reasoning parts entirely", () => {
        const m = msg([reasoning("the user wants a greeting..."), text("hi")]);
        expect(textOf(m)).toBe("hi");
        expect(textOf(m)).not.toContain("user wants");
    });

    test("survives a tool part landing between text parts", () => {
        expect(textOf(msg([text("one "), tool("getHotCoins", "output-available"), text("two")])))
            .toBe("one two");
    });

    test("a message with no text parts yields empty string, not undefined", () => {
        expect(textOf(msg([reasoning("thinking")]))).toBe("");
        expect(textOf(msg([]))).toBe("");
    });
});

describe("isThinking", () => {
    // The whole point: reasoning has started, no answer yet. Without this the
    // panel sits on a bare typing dot for several seconds and reads as broken.
    test("true while only reasoning has arrived", () => {
        expect(isThinking(msg([reasoning("hmm")]))).toBe(true);
    });

    test("false the moment real text arrives", () => {
        expect(isThinking(msg([reasoning("hmm"), text("the answer")]))).toBe(false);
    });

    // A streaming text part can exist while still empty; that is NOT an answer,
    // so the thinking state must hold rather than flickering off and back on.
    test("whitespace-only text does not count as an answer", () => {
        expect(isThinking(msg([reasoning("hmm"), text("")]))).toBe(true);
        expect(isThinking(msg([reasoning("hmm"), text("   ")]))).toBe(true);
    });

    test("false when there is no reasoning at all (non-reasoning model)", () => {
        expect(isThinking(msg([]))).toBe(false);
        expect(isThinking(msg([text("direct answer")]))).toBe(false);
    });
});

describe("pendingToolLabels", () => {
    test("labels an in-flight tool in the user's words", () => {
        expect(pendingToolLabels(msg([tool("getLiveStreams", "input-available")])))
            .toEqual(["checking who's live"]);
    });

    // Once a tool returns, the answer is the feedback. A stale "checking…" next
    // to a finished reply reads as stuck.
    test("drops tools that have already returned or errored", () => {
        expect(pendingToolLabels(msg([tool("getHotCoins", "output-available")]))).toEqual([]);
        expect(pendingToolLabels(msg([tool("getHotCoins", "output-error")]))).toEqual([]);
    });

    test("dedupes repeated calls to the same tool", () => {
        const m = msg([tool("lookupCoin", "input-available"), tool("lookupCoin", "input-streaming")]);
        expect(pendingToolLabels(m)).toEqual(["looking up that coin"]);
    });

    test("an unknown tool still gets a readable label, never 'undefined'", () => {
        const labels = pendingToolLabels(msg([tool("somethingNew", "input-available")]));
        expect(labels).toEqual(["looking that up"]);
        expect(labels[0]).not.toContain("undefined");
    });

    test("ignores non-tool parts", () => {
        expect(pendingToolLabels(msg([text("hi"), reasoning("hmm")]))).toEqual([]);
    });
});

// ── account tools ────────────────────────────────────────────────────────────
//
// These two decide whether a security-relevant control appears at all. A wrong
// field name renders NOTHING and fails open in the worst way: no key card, or —
// worse — no approval prompt, leaving a destructive tool call waiting on an
// answer the user was never asked for. Both shapes are pinned here because they
// are narrowed by hand in the reader, so tsc cannot check them.

const cardPart = (name: string, output: unknown, state = "output-available") => ({
    type: `tool-${name}`,
    state,
    toolCallId: "call-1",
    output,
});

describe("streamKeyCards", () => {
    test("reads a finished getStreamKey call", () => {
        const got = streamKeyCards(msg([cardPart("getStreamKey", { kind: "stream_key_card", hasKey: true })]));
        expect(got).toHaveLength(1);
        expect(got[0].rotated).toBe(false);
    });

    test("marks a rotation so the card can warn about the old key", () => {
        const got = streamKeyCards(
            msg([cardPart("rotateStreamKey", { kind: "stream_key_card", rotated: true })]),
        );
        expect(got[0].rotated).toBe(true);
    });

    test("ignores calls that haven't produced output yet", () => {
        expect(streamKeyCards(msg([cardPart("getStreamKey", undefined, "input-available")]))).toHaveLength(0);
    });

    test("ignores an error result rather than rendering an empty card", () => {
        expect(
            streamKeyCards(msg([cardPart("rotateStreamKey", { kind: "error", message: "nope" })])),
        ).toHaveLength(0);
    });

    test("never renders for an unrelated tool", () => {
        expect(streamKeyCards(msg([cardPart("getHotCoins", { kind: "stream_key_card" })]))).toHaveLength(0);
    });
});

describe("pendingApprovals", () => {
    // The field is approval.id. `approvalId` is the SERVER-side name
    // (ToolApprovalRequestOutput); the UI part nests it. Reading the wrong one
    // silently shows no prompt, which is how a rotation would hang forever.
    const approvalPart = (id: string) => ({
        type: "tool-rotateStreamKey",
        state: "approval-requested",
        approval: { id },
    });

    test("surfaces a request waiting on the user", () => {
        const got = pendingApprovals(msg([approvalPart("appr-1")]));
        expect(got).toEqual([{ approvalId: "appr-1", toolName: "rotateStreamKey" }]);
    });

    test("stops showing it once answered", () => {
        expect(
            pendingApprovals(
                msg([{ type: "tool-rotateStreamKey", state: "approval-responded", approval: { id: "a", approved: true } }]),
            ),
        ).toHaveLength(0);
    });

    test("ignores a request with no id rather than rendering a dead button", () => {
        expect(pendingApprovals(msg([{ type: "tool-rotateStreamKey", state: "approval-requested", approval: {} }]))).toHaveLength(0);
    });

    test("ignores non-tool parts", () => {
        expect(pendingApprovals(msg([text("hi")]))).toHaveLength(0);
    });
});
