"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Squircle } from "@/components/ui/squircle";
import { ArrowUpIcon, CloseIcon, RefreshIcon } from "@/components/icons";
import { StarOutline } from "@/components/ai/star-morph-icon";
import { ExpandMorphIcon } from "@/components/ai/expand-morph-icon";
import {
    ChatContainerContent,
    ChatContainerRoot,
    ChatContainerScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import { Loader } from "@/components/prompt-kit/loader";
import { Message, MessageContent } from "@/components/prompt-kit/message";
import { PromptInput, PromptInputTextarea } from "@/components/prompt-kit/prompt-input";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import { useAuthSession } from "@/hooks/use-auth-session";

// The assistant's chat surface. Lazy-loaded (ssr: false) by ask-watchparty.tsx,
// so the AI SDK, the markdown renderer and shiki are all paid for on first
// press rather than on every page the dock renders on.
//
// UI is prompt-kit (prompt-kit.com), vendored under components/prompt-kit/ —
// see the note in scroll-button.tsx for why they're vendored instead of
// installed through the shadcn CLI. Restyled to watchparty's language: no
// gradients, no drop shadows (flat fill + one slate hairline), squircled
// panels, rounded-full pills, h-11 controls, font-pixel brand line, lowercase.
//
// Docked and overlay are two renderings of ONE component instance on purpose.
// `useChat` lives here, above the branch, so expanding mid-answer keeps the
// thread and the in-flight stream — hoisting it any higher would drag the SDK
// into the always-loaded trigger, and pushing it any lower would reset the
// conversation every time you resized.

const SUGGESTIONS = [
    "what's running today?",
    "how do creator subs work?",
    "what is a first buy?",
    "how do i go live?",
    "explain coins to me",
];

const HEADER_BTN =
    "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-soft-gray-15 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500";

// `parts` is the SDK's tagged union; text is the only kind this assistant
// produces today, but joining rather than taking [0] means a reasoning or tool
// part landing later degrades to "renders the prose" instead of "renders
// nothing".
function textOf(message: UIMessage) {
    return message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
}

export function AskSurface({
    expanded,
    onExpandedChange,
    onClose,
}: {
    expanded: boolean;
    onExpandedChange: (next: boolean) => void;
    onClose: () => void;
}) {
    const [input, setInput] = useState("");
    const reduced = useReducedMotion();
    const { data: session } = useAuthSession();

    const avatar =
        (session?.user as { avatar_url?: string | null; image?: string | null } | undefined)?.avatar_url ??
        session?.user?.image ??
        undefined;

    // Built once. A fresh transport per render would hand useChat a new
    // identity on every keystroke.
    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: "/api/assistant",
                prepareSendMessagesRequest: ({ messages, body }) => ({
                    body: { messages, path: window.location.pathname, ...body },
                }),
            }),
        [],
    );

    const { messages, sendMessage, status, stop, error, setMessages, clearError } = useChat({
        transport,
        // Coalesce render work while tokens land. Without it every delta is a
        // React commit, which is what makes streaming chat feel janky on a
        // loaded machine.
        throttle: 50,
    });

    const busy = status === "submitted" || status === "streaming";

    const submit = () => {
        const text = input.trim();
        if (!text || busy) return;
        setInput("");
        clearError();
        void sendMessage({ text });
    };

    const reset = () => {
        stop();
        clearError();
        setMessages([]);
        setInput("");
    };

    const header = (
        <div className="flex shrink-0 items-center gap-3 border-b border-flexborder px-4 py-3.5">
            <StarOutline className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="font-pixel text-[13px] leading-none text-flexwhite">ask watchparty</p>
                <p className="mt-1.5 text-[11px] leading-none text-postgray">powered by glm</p>
            </div>
            <button
                type="button"
                onClick={reset}
                disabled={messages.length === 0}
                aria-label="new chat"
                className={HEADER_BTN}
            >
                <RefreshIcon className="size-4" />
            </button>
            {/* Resize. The icon IS the state: brackets docked, X in the
                overlay, morphed rather than swapped — so the control reads as
                reversing itself. Pressing the X returns to the docked panel;
                the backdrop closes out entirely. */}
            <button
                type="button"
                onClick={() => onExpandedChange(!expanded)}
                aria-label={expanded ? "shrink to panel" : "expand to overlay"}
                aria-pressed={expanded}
                className={HEADER_BTN}
            >
                <ExpandMorphIcon expanded={expanded} className="size-4" />
            </button>
            {/* Only docked — in the overlay the morphed X is the exit, and two
                X's side by side would be two ways to guess at the same thing. */}
            {!expanded && (
                <button type="button" onClick={onClose} aria-label="close" className={HEADER_BTN}>
                    <CloseIcon className="size-4" />
                </button>
            )}
        </div>
    );

    const suggestions = (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-flexborder px-4 py-3">
            {SUGGESTIONS.map((s) => (
                <PromptSuggestion
                    key={s}
                    onClick={() => setInput(s)}
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 whitespace-nowrap border-flexborder bg-soft-gray-10 px-3.5 text-xs font-medium text-zinc-300 hover:bg-soft-gray-15 hover:text-white"
                >
                    {s}
                </PromptSuggestion>
            ))}
        </div>
    );

    // `relative` sits on the wrapper, NOT on ChatContainerRoot — Root is the
    // scroll container, and an absolutely-positioned child whose containing
    // block is the scroller scrolls away with the content instead of staying
    // pinned. Anchoring to the non-scrolling wrapper is what keeps the scroll
    // button parked at the bottom edge (this is prompt-kit's own structure).
    const thread = (
        <div className="relative min-h-0 flex-1">
            <ChatContainerRoot className="h-full">
                <ChatContainerContent className="flex flex-col gap-5 px-4 py-4">
                {messages.length === 0 && !busy && (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                        <StarOutline className="size-8" />
                        <p className="max-w-[36ch] text-sm leading-relaxed text-zinc-500">
                            ask me anything about watchparty — coins, streams, subscriptions, or how any of it works.
                        </p>
                    </div>
                )}

                {messages.map((m) =>
                    m.role === "assistant" ? (
                        <Message key={m.id} className="items-start gap-2.5">
                            <StarOutline className="mt-1 size-4 shrink-0" />
                            {/* Markdown is styled with explicit child
                                selectors, NOT `prose-*` modifiers: prompt-kit
                                assumes @tailwindcss/typography and this project
                                doesn't install it, so the `prose` class it puts
                                on MessageContent — and every prose-* variant —
                                silently does nothing here. */}
                            <MessageContent
                                markdown
                                className={[
                                    "min-w-0 flex-1 bg-transparent p-0 text-sm leading-relaxed text-zinc-200",
                                    "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
                                    "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
                                    "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
                                    "[&_li]:my-1 [&_li]:pl-0.5",
                                    "[&_a]:text-bleu [&_a]:underline [&_a]:underline-offset-2",
                                    "[&_strong]:font-semibold [&_strong]:text-flexwhite",
                                    "[&_code]:rounded [&_code]:bg-soft-gray-15 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]",
                                    "[&_pre]:my-2 [&_pre]:overflow-x-auto",
                                ].join(" ")}
                            >
                                {textOf(m)}
                            </MessageContent>
                        </Message>
                    ) : (
                        <Message key={m.id} className="flex-row-reverse items-end gap-2.5">
                            <Avatar className="size-6 shrink-0">
                                <AvatarImage src={avatar} alt="" className="object-cover" />
                                <AvatarFallback />
                            </Avatar>
                            <MessageContent className="max-w-[80%] rounded-2xl bg-soft-gray-15 px-3.5 py-2 text-sm leading-relaxed text-flexwhite">
                                {textOf(m)}
                            </MessageContent>
                        </Message>
                    ),
                )}

                {/* Only until the first token lands — after that the reply
                    itself is the progress indicator. */}
                {status === "submitted" && (
                    <Message className="items-start gap-2.5">
                        <StarOutline className="mt-1 size-4 shrink-0" />
                        <Loader variant="typing" className="text-zinc-500" />
                    </Message>
                )}

                {error && (
                    <p className="text-xs leading-relaxed text-pastelred">
                        {error.message || "something went wrong — try again"}
                    </p>
                )}
                </ChatContainerContent>
                <ChatContainerScrollAnchor />

                {/* Stays INSIDE Root — ScrollButton reads
                    useStickToBottomContext(), which only exists under
                    StickToBottom. It's the containing block that has to be
                    outside the scroller, not the element. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
                    <ScrollButton className="pointer-events-auto border-flexborder bg-soft-gray-15 text-zinc-300 hover:bg-soft-gray-20 hover:text-white" />
                </div>
            </ChatContainerRoot>
        </div>
    );

    const composer = (
        <div className="shrink-0 border-t border-flexborder p-3">
            <PromptInput
                value={input}
                onValueChange={setInput}
                onSubmit={submit}
                isLoading={busy}
                // prompt-kit ships this with `shadow-xs`; stripped, because a
                // neutral drop shadow is the one depth cue this app never uses.
                className="rounded-3xl border-flexborder bg-soft-gray-10 p-2 shadow-none"
            >
                <div className="flex items-end gap-2">
                    <PromptInputTextarea
                        placeholder="ask anything…"
                        className="min-h-[44px] flex-1 bg-transparent px-2 text-sm text-flexwhite placeholder:text-zinc-500"
                    />
                    <button
                        type="button"
                        onClick={busy ? () => stop() : submit}
                        disabled={!busy && !input.trim()}
                        aria-label={busy ? "stop" : "send"}
                        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-soft-gray-15 disabled:text-zinc-600"
                    >
                        {busy ? <span className="size-3 rounded-[3px] bg-current" /> : <ArrowUpIcon className="size-5" />}
                    </button>
                </div>
            </PromptInput>
        </div>
    );

    const body = (
        <>
            {header}
            {suggestions}
            {thread}
            {composer}
        </>
    );

    if (expanded) {
        // Portalled to the body so the overlay escapes the dock's sticky
        // stacking context entirely, rather than trying to out-z-index the
        // page from inside a 60px column.
        //
        // No `mounted` guard before touching `document`: this whole module is
        // loaded with `ssr: false`, so it only ever renders on the client.
        return createPortal(
            <motion.div
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.18 }}
                className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
                // Backdrop closes out completely — the header's X only shrinks
                // back to the docked panel, so this is the way out.
                onPointerDown={(e) => {
                    if (e.target === e.currentTarget) onClose();
                }}
                role="dialog"
                aria-modal="true"
                aria-label="ask watchparty"
            >
                <motion.div
                    initial={reduced ? false : { scale: 0.97, y: 8 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 30, mass: 0.7 }}
                    className="h-[min(680px,86vh)] w-[min(720px,92vw)]"
                >
                    <Squircle asChild radius={28}>
                        <div className="flex h-full w-full flex-col overflow-hidden border border-flexborder bg-[#111]">
                            {body}
                        </div>
                    </Squircle>
                </motion.div>
            </motion.div>,
            document.body,
        );
    }

    return (
        <motion.div
            initial={reduced ? false : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 28, mass: 0.7 }}
            // Grows out of the button it's anchored to, not its own middle.
            style={{ transformOrigin: "bottom right" }}
            className="absolute bottom-full right-0 z-50 mb-3 w-[380px]"
            role="dialog"
            aria-label="ask watchparty"
            // Read by the trigger's click-away handler to tell "pressed inside
            // the panel" from "pressed the page".
            data-ask-panel=""
        >
            <Squircle asChild radius={24}>
                {/* Flat fill + one hairline, per docs/design-principles.md — a
                    floating panel here does NOT get a drop shadow. */}
                <div className="flex h-[520px] w-full flex-col overflow-hidden border border-flexborder bg-[#111]">
                    {body}
                </div>
            </Squircle>
        </motion.div>
    );
}

export default AskSurface;
