"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Squircle } from "@/components/ui/squircle";
import { ArrowUpIcon, CloseIcon, RefreshIcon } from "@/components/icons";
import { StarOutline } from "@/components/ai/star-morph-icon";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";

// The assistant panel, anchored above the dock's star button. Lazy-loaded by
// components/ai/ask-watchparty.tsx so nothing here — including the thread UI —
// is paid for until the button is actually pressed.
//
// Shape borrowed from the uitripled floating-chat-widget, rebuilt in
// watchparty's language: no gradients, no drop shadows (flat fill + one slate
// hairline), squircled panel with rounded-full pills inside it, font-pixel for
// the brand line, lowercase copy. The reference's multi-agent picker is gone —
// there is one model here — and that slot holds starter prompts instead.

type ChatMessage = { role: "user" | "assistant"; content: string };

// Seed the input rather than sending outright: a starter is a way to begin
// typing, and firing a request the moment someone taps one gives them no chance
// to make it their own question.
const SUGGESTIONS = [
    "what's running today?",
    "how do creator subs work?",
    "what is a first buy?",
    "how do i go live?",
    "explain coins to me",
];

const HEADER_BTN =
    "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-soft-gray-15 hover:text-white";

const CHIP =
    "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-full border border-flexborder bg-soft-gray-10 px-3.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-soft-gray-15 hover:text-white";

function TypingDots() {
    return (
        <div className="flex items-center gap-1 py-2">
            <span className="size-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-zinc-500" />
        </div>
    );
}

export function AskPanel({ onClose }: { onClose: () => void }) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const scroller = useRef<HTMLDivElement>(null);
    const inputEl = useRef<HTMLInputElement>(null);
    // Aborts the in-flight stream on unmount, so closing the panel stops the
    // upstream Workers AI read instead of letting it run to completion unseen.
    const abort = useRef<AbortController | null>(null);

    const reduced = useReducedMotion();
    const utils = trpc.useUtils();
    const { data: session } = useAuthSession();
    const avatar =
        (session?.user as { avatar_url?: string | null; image?: string | null } | undefined)?.avatar_url ??
        session?.user?.image ??
        undefined;

    useEffect(() => {
        inputEl.current?.focus();
        return () => abort.current?.abort();
    }, []);

    // Pin to the newest content on every token, not just every message — a
    // streaming reply grows the thread continuously.
    useEffect(() => {
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages, pending]);

    const send = useCallback(
        async (text: string) => {
            const question = text.trim();
            if (!question || pending) return;

            // The thread is client-held and sent back whole each turn, so build
            // the next one first and use it for both the render and the request
            // — reading it back off state here would send the stale array.
            const next: ChatMessage[] = [...messages, { role: "user", content: question }];
            setMessages(next);
            setInput("");
            setError(null);
            setPending(true);

            abort.current?.abort();
            const controller = new AbortController();
            abort.current = controller;

            try {
                const stream = await utils.client.assistant.chat.mutate(
                    // Trim to the model's window from the newest end; the cap
                    // matches the router's input schema.
                    { messages: next.slice(-20), path: window.location.pathname },
                    { signal: controller.signal },
                );

                let reply = "";
                let placed = false;

                for await (const delta of stream) {
                    reply += delta;
                    setMessages((current) => {
                        // First token appends the assistant row; every one after
                        // it rewrites that same row in place.
                        if (!placed) return [...current, { role: "assistant", content: reply }];
                        const copy = [...current];
                        copy[copy.length - 1] = { role: "assistant", content: reply };
                        return copy;
                    });
                    placed = true;
                }

                if (!placed) setError("no reply came back — try again");
            } catch (err) {
                // An abort is the user closing the panel, not a failure.
                if (controller.signal.aborted) return;
                setError(err instanceof Error ? err.message : "something went wrong — try again");
            } finally {
                if (!controller.signal.aborted) setPending(false);
            }
        },
        [messages, pending, utils],
    );

    const reset = () => {
        abort.current?.abort();
        abort.current = null;
        setMessages([]);
        setError(null);
        setPending(false);
        inputEl.current?.focus();
    };

    return (
        <motion.div
            initial={reduced ? false : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            transition={
                reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 320, damping: 28, mass: 0.7 }
            }
            // Grows out of the button it's anchored to, rather than out of its
            // own middle.
            style={{ transformOrigin: "bottom right" }}
            className="absolute bottom-full right-0 z-50 mb-3 w-[380px]"
            role="dialog"
            aria-label="ask watchparty"
            // Read by the widget's click-away handler to tell "pressed inside
            // the panel" from "pressed the page".
            data-ask-panel=""
        >
            <Squircle asChild radius={24}>
                {/* Flat fill + one hairline, per docs/design-principles.md —
                    a floating panel here does NOT get a drop shadow. */}
                <div className="flex w-full flex-col overflow-hidden border border-flexborder bg-[#111]">
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
                            className={`${HEADER_BTN} disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500`}
                        >
                            <RefreshIcon className="size-4" />
                        </button>
                        <button type="button" onClick={onClose} aria-label="close" className={HEADER_BTN}>
                            <CloseIcon className="size-4" />
                        </button>
                    </div>

                    {/* Starter prompts. Kept visible mid-thread rather than only
                        on the empty state — "explain coins to me" is just as
                        useful as a follow-up as it is as an opener. */}
                    <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-flexborder px-4 py-3">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => {
                                    setInput(s);
                                    inputEl.current?.focus();
                                }}
                                className={CHIP}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    <div ref={scroller} className="flex h-[300px] flex-col gap-5 overflow-y-auto px-4 py-4">
                        {messages.length === 0 && !pending && (
                            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                                <StarOutline className="size-8" />
                                <p className="text-sm leading-relaxed text-zinc-500">
                                    ask me anything about watchparty — coins, streams, subscriptions, or how any of it
                                    works.
                                </p>
                            </div>
                        )}

                        {messages.map((m, i) =>
                            m.role === "assistant" ? (
                                <div key={i} className="flex gap-2.5">
                                    <StarOutline className="mt-1 size-4 shrink-0" />
                                    <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-200">
                                        {m.content}
                                    </p>
                                </div>
                            ) : (
                                <div key={i} className="flex flex-row-reverse items-end gap-2.5">
                                    <Avatar className="size-6 shrink-0">
                                        <AvatarImage src={avatar} alt="" className="object-cover" />
                                        <AvatarFallback />
                                    </Avatar>
                                    <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-soft-gray-15 px-3.5 py-2 text-sm leading-relaxed text-flexwhite">
                                        {m.content}
                                    </div>
                                </div>
                            ),
                        )}

                        {/* Only until the first token lands — after that the
                            reply itself is the progress indicator. */}
                        {pending && messages[messages.length - 1]?.role === "user" && (
                            <div className="flex gap-2.5">
                                <StarOutline className="mt-1 size-4 shrink-0" />
                                <TypingDots />
                            </div>
                        )}

                        {error && <p className="text-xs leading-relaxed text-pastelred">{error}</p>}
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void send(input);
                        }}
                        className="flex shrink-0 items-center gap-2 border-t border-flexborder p-3"
                    >
                        <input
                            ref={inputEl}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="ask anything…"
                            maxLength={4000}
                            className="h-11 min-w-0 flex-1 rounded-full border border-flexborder bg-soft-gray-10 px-4 text-sm text-flexwhite outline-none transition-colors placeholder:text-zinc-500 focus:border-white/20"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || pending}
                            aria-label="send"
                            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-soft-gray-15 disabled:text-zinc-600"
                        >
                            <ArrowUpIcon className="size-5" />
                        </button>
                    </form>
                </div>
            </Squircle>
        </motion.div>
    );
}

export default AskPanel;
