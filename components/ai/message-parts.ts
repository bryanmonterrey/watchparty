import type { UIMessage } from "ai";

// The pure part-reading logic behind the assistant's message rendering.
//
// Extracted out of ask-surface.tsx so it can be tested without a browser.
// These three functions ARE the render path: if `textOf` stops matching, the
// chat shows empty bubbles — which is exactly the symptom that shipped eight
// times before anyone caught it. They take a UIMessage and return plain data,
// so tests/assistant-message-parts.test.ts can pin them in milliseconds.

/**
 * The visible answer. Joins rather than taking [0] so a reasoning or tool part
 * landing between text parts degrades to "renders the prose" rather than
 * "renders nothing".
 */
export function textOf(message: UIMessage): string {
    return message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
}

/**
 * GLM-5.2 is a reasoning model: it streams 200-700 `reasoning_content` deltas
 * BEFORE the first content token (measured — scripts/ai/smoke-assistant.mjs).
 * `@ai-sdk/openai-compatible` maps those to `type: "reasoning"` parts, which is
 * how the UI tells "thinking" from "stalled". Without it the panel shows a bare
 * typing dot for several seconds and reads as broken.
 *
 * Reasoning is never rendered as prose — it's the model's scratchpad and
 * contradicts itself mid-stream, which is also why `textOf` filters it out.
 */
export function isThinking(message: UIMessage): boolean {
    const hasAnswer = message.parts.some(
        (p) => p.type === "text" && (p as { text?: string }).text?.trim(),
    );
    return !hasAnswer && message.parts.some((p) => p.type === "reasoning");
}

/** What the assistant is looking up, in the user's words rather than the tool's. */
export const TOOL_LABELS: Record<string, string> = {
    getHotCoins: "checking what's running",
    lookupCoin: "looking up that coin",
    getLiveStreams: "checking who's live",
    getMarketTrending: "checking the market",
};

/**
 * Tool calls arrive as parts typed `tool-<name>`. Only the IN-FLIGHT ones are
 * surfaced: once a tool returns, the answer it produced is the feedback, and a
 * stale "checking…" beside a finished reply reads as stuck.
 */
export function pendingToolLabels(message: UIMessage): string[] {
    return message.parts
        .filter((p) => {
            if (!p.type.startsWith("tool-")) return false;
            const state = (p as { state?: string }).state;
            return state !== "output-available" && state !== "output-error";
        })
        .map((p) => TOOL_LABELS[p.type.slice("tool-".length)] ?? "looking that up")
        .filter((label, i, all) => all.indexOf(label) === i);
}

/**
 * Account-tool parts that render as UI rather than prose.
 *
 * These carry NO secret — the tool returns `{ kind: "stream_key_card" }` and the
 * component fetches the real value itself (see components/ai/stream-key-card.tsx
 * for why). So this reads a marker, not a payload.
 */
export function streamKeyCards(message: UIMessage): { id: string; rotated: boolean }[] {
    return (message.parts ?? [])
        .filter((p) => p.type === "tool-getStreamKey" || p.type === "tool-rotateStreamKey")
        .flatMap((p) => {
            const part = p as { toolCallId?: string; state?: string; output?: unknown };
            if (part.state !== "output-available") return [];
            const out = part.output as { kind?: string; rotated?: boolean } | undefined;
            if (out?.kind !== "stream_key_card") return [];
            return [{ id: part.toolCallId ?? "key", rotated: !!out.rotated }];
        });
}

/**
 * Tool calls waiting on the user's approval.
 *
 * `needsApproval` pauses the run and emits these; nothing executes server-side
 * until the client answers. That is the gate that keeps a destructive action out
 * of the model's hands — the assistant's context contains attacker-controlled
 * stream titles, so the decision has to belong to the account owner.
 */
export function pendingApprovals(
    message: UIMessage,
): { approvalId: string; toolName: string }[] {
    return (message.parts ?? []).flatMap((p) => {
        // `approval.id` — NOT `approvalId`. That field name only exists on the
        // server-side ToolApprovalRequestOutput; the UI part nests it as
        // `approval: { id }`. The distinction is invisible to tsc here because
        // the part is narrowed by hand, and getting it wrong renders no
        // approval prompt at all — the run just hangs waiting for an answer
        // the user was never asked for.
        const part = p as { type: string; state?: string; approval?: { id?: string } };
        if (!part.type.startsWith("tool-") || part.state !== "approval-requested") return [];
        const approvalId = part.approval?.id;
        if (!approvalId) return [];
        return [{ approvalId, toolName: part.type.slice("tool-".length) }];
    });
}
