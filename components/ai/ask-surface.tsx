"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { Squircle } from "@/components/ui/squircle";
import { ArrowUpIcon, AudioWavesIcon, CloseIcon, HistoryIcon } from "@/components/icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignSquareIcon } from "@hugeicons/core-free-icons";
import { ExpandMorphIcon } from "@/components/ai/expand-morph-icon";
import {
    ChatContainerContent,
    ChatContainerRoot,
    ChatContainerScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import { Loader } from "@/components/prompt-kit/loader";
import { Message, MessageContent } from "@/components/prompt-kit/message";
import {
    PromptInput,
    PromptInputActions,
    PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import { WalletPill, type PickedWallet } from "@/components/ai/wallet-pill";
import { trpc } from "@/lib/trpc/client";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import { cn } from "@/lib/utils";
import { AskHistoryDialog } from "@/components/ai/ask-history-dialog";
// Pure part-reading logic lives in its own module so it can be unit-tested
// without a browser — see tests/assistant-message-parts.test.ts.
import { textOf, isThinking, pendingToolLabels, streamKeyCards, pendingApprovals } from "@/components/ai/message-parts";
import { StreamKeyCard } from "@/components/ai/stream-key-card";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";

// The assistant's chat surface. Lazy-loaded (ssr: false) by ask-watchparty.tsx,
// so the AI SDK, the markdown renderer and shiki are all paid for on first
// press rather than on every page the dock renders on.
//
// UI is prompt-kit (prompt-kit.com), vendored under components/prompt-kit/ —
// see the note in scroll-button.tsx for why they're vendored instead of
// installed through the shadcn CLI. Restyled to watchparty's language: no
// gradients, no drop shadows (flat fill + one slate hairline), squircled
// panels, rounded-full pills, h-11 controls. Copy is sentence case and the
// display face is the project font (Geist), not font-pixel.
//
// COLOURS ARE FIXED, NOT THEMED. This panel paints its own dark surface
// (bg-[#111] docked, bg-canvas expanded) on every theme, so it must not
// use theme-flipping tokens. `text-flexwhite` is #e7e9ea in dark but #0f1419 —
// near-black — in LIGHT, which rendered the title, the user's own messages and
// the input as black-on-black: present in the DOM, completely invisible. Same
// trap with `border-flexborder` (near-white in light). Fixed values only here.
//
// Docked and overlay are two renderings of ONE component instance on purpose.
// `useChat` lives here, above the branch, so expanding mid-answer keeps the
// thread and the in-flight stream — hoisting it any higher would drag the SDK
// into the always-loaded trigger, and pushing it any lower would reset the
// conversation every time you resized.

const SUGGESTIONS = [
    "What's running today?",
    "How do creator subs work?",
    "What is a first buy?",
    "How do I go live?",
    "Explain coins to me",
];

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

    // Live dictation. Settled phrases append to `input` so they're editable
    // like anything typed; the in-flight phrase stays in `voice.interim` until
    // Deepgram calls it final, because interim results are REVISIONS of the
    // same phrase rather than new words — committing them would stutter the
    // text. Running out of messages opens the same upgrade path a typed send
    // would, so voice can't be used to route around the quota.
    const voice = useVoiceDictation({
        onFinalText: (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
        onQuotaExhausted: () => usePremiumOverlay.getState().openOverlay("premium"),
    });

    // Which wallet the assistant is talking about. Null = the user's primary,
    // resolved server-side; the pill only appears when there's a real choice.
    const [wallet, setWallet] = useState<PickedWallet | null>(null);
    const reduced = useReducedMotion();
    const utils = trpc.useUtils();

    // What's left in this window. Read-only — the quota is charged server-side
    // when a message is actually sent, so opening the panel costs nothing.
    const { data: quota } = trpc.assistant.quota.useQuery(undefined, { staleTime: 30_000 });

    // Built once. A fresh transport per render would hand useChat a new
    // identity on every keystroke.
    //
    // The custom `fetch` is how the quota gate reaches the UI. The SDK turns a
    // non-2xx into a thrown error whose message is the raw body — useless to
    // read and impossible to branch on — so the 402 is intercepted here,
    // BEFORE it becomes an opaque error: the upgrade overlay opens for users
    // who can still upgrade, and either way a readable sentence is thrown.
    // (This is vercel/ai-chatbot's `fetchWithErrorHandlers` idea.)
    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: "/api/assistant",
                // The transport is built ONCE, so nothing render-scoped can be
                // closed over here — it would pin first-render values forever.
                // Per-message fields (the picked wallet) ride in via
                // sendMessage's `body` option and land in `...body` below.
                prepareSendMessagesRequest: ({ messages, body }) => ({
                    body: { messages, path: window.location.pathname, ...body },
                }),
                fetch: async (input, init) => {
                    const res = await fetch(input as RequestInfo, init);
                    if (res.status === 402) {
                        const detail = (await res.json().catch(() => null)) as
                            | { error?: string; upgrade?: boolean }
                            | null;
                        // Only for people who aren't already paying — showing a
                        // subscriber a "subscribe" sheet they're inside of is
                        // nonsense. They've hit their tier ceiling instead.
                        if (detail?.upgrade) {
                            usePremiumOverlay.getState().openOverlay("premium");
                        }
                        void utils.assistant.quota.invalidate();
                        throw new Error(detail?.error ?? "You've used your AI allowance");
                    }
                    return res;
                },
            }),
        [utils],
    );

    const {
        messages,
        sendMessage,
        status,
        stop,
        error,
        setMessages,
        clearError,
        addToolApprovalResponse,
    } = useChat({
        transport,
        // Coalesce render work while tokens land. Without it every delta is a
        // React commit, which is what makes streaming chat feel janky on a
        // loaded machine.
        throttle: 50,
        // Each answer spends a message and some tokens; re-read so the counter
        // in the header is right without polling for it.
        onFinish: () => void utils.assistant.quota.invalidate(),
    });

    const busy = status === "submitted" || status === "streaming";
    // Drives the composer's one button: empty input shows the mic, typed input
    // shows send.
    const canSend = input.trim().length > 0;
    // "starting" counts: the token fetch and the permission prompt happen in
    // it, and during that window the button must already be a stop control.
    const micActive = voice.listening || voice.state === "starting";
    const exhausted = !!quota && (quota.remaining <= 0 || quota.tokenCeilingHit);

    // Which conversation this is. Minted on the first SEND, not on mount, so
    // opening and closing the panel without asking anything leaves no empty
    // thread in the history list. Client-generated on purpose — see
    // server/lib/assistant-threads.ts for why that's safe.
    const [threadId, setThreadId] = useState<string | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);

    // Cmd/Ctrl+K opens conversation history — but only while the panel is up.
    //
    // That key is already global: app-sidebar routes it to /search. Overriding
    // it here is deliberate rather than a collision, because navigating away to
    // a site-wide search page is close to the last thing someone wants while
    // they're mid-conversation with the assistant; in this context "search"
    // means these threads.
    //
    // CAPTURE phase, which is what actually makes the override work. Both
    // listeners are on `document`, so stopPropagation during bubbling would not
    // stop the other one — capture runs first, and stopping there prevents the
    // bubble listener from ever seeing the event.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "k" || !(e.metaKey || e.ctrlKey)) return;
            e.preventDefault();
            e.stopPropagation();
            setHistoryOpen((v) => !v);
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, []);

    const newChat = () => {
        stop();
        clearError();
        setMessages([]);
        setInput("");
        setThreadId(null);
    };

    // Replaying a stored thread. The saved `parts` go back verbatim rather than
    // being flattened to text: they carry tool calls and reasoning, and a
    // reloaded conversation has to render what the live one rendered.
    const loadThread = async (id: string) => {
        stop();
        clearError();
        setInput("");
        const thread = await utils.assistant.thread.fetch({ id });
        setMessages(
            thread.messages.map((m) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                parts: m.parts as UIMessage["parts"],
            })),
        );
        setThreadId(id);
    };

    const submit = () => {
        const text = input.trim();
        if (!text || busy) return;
        // crypto.randomUUID needs a secure context, which production is; the
        // fallback keeps localhost-over-http working rather than throwing.
        const id = threadId ?? (globalThis.crypto?.randomUUID?.() ?? null);
        if (id && id !== threadId) setThreadId(id);
        setInput("");
        clearError();
        // Wallet rides per-message, not in the transport — see the
        // prepareSendMessagesRequest note above.
        void sendMessage({ text }, { body: { wallet: wallet?.name, threadId: id ?? undefined } });
    };


    // Chrome only — no title, no avatar, no username. Four controls, right
    // aligned, left to right: history, resize, new chat, close. The app
    // header's morphed X handles the OVERLAY; this X is the docked panel's own
    // exit, which is why both can exist without reading as duplicates.
    const ICON_BTN =
        "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-soft-gray-15 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500";

    const header = (
        <div className="flex shrink-0 items-center justify-end gap-0.5 px-2 pt-2">
            <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label="chat history (⌘K)"
                title="Chat history  ⌘K"
                className={ICON_BTN}
            >
                <HistoryIcon className="size-4" />
            </button>
            <button
                type="button"
                onClick={() => onExpandedChange(!expanded)}
                aria-label={expanded ? "shrink to panel" : "expand to overlay"}
                aria-pressed={expanded}
                className={ICON_BTN}
            >
                <ExpandMorphIcon expanded={expanded} className="size-4" />
            </button>
            <button
                type="button"
                onClick={newChat}
                disabled={messages.length === 0}
                aria-label="new chat"
                className={ICON_BTN}
            >
                <HugeiconsIcon icon={PlusSignSquareIcon} className="size-4" strokeWidth={2} />
            </button>
            {/* Docked only. In the OVERLAY the app header's morphed hamburger
                is the way out, and the shrink control to the left already
                returns you to the panel — a third dismissal here was the
                duplicate X. */}
            {!expanded && (
                <button type="button" onClick={onClose} aria-label="close" className={ICON_BTN}>
                    <CloseIcon className="size-4" />
                </button>
            )}
        </div>
    );

    // Starter prompts, following zola: BELOW the composer, and only on an
    // empty thread. Above the messages they were permanent chrome competing
    // with the conversation; below the input they read as what they are — a
    // way to begin — and get out of the way the moment there is one.
    //
    // Motion is zola's: a staggered scale + blur-in at 0.02s per item. Gated on
    // reduced motion like everything else here.
    const suggestions = messages.length === 0 && (
        <div className="flex shrink-0 flex-wrap justify-center gap-2 px-3 pb-3">
            {SUGGESTIONS.map((s, i) => (
                <motion.div
                    key={s}
                    initial={reduced ? false : { opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    transition={reduced ? { duration: 0 } : { duration: 0.25, ease: [0.23, 1, 0.32, 1], delay: i * 0.02 }}
                >
                    <PromptSuggestion
                        onClick={() => setInput(s)}
                        size="sm"
                        variant="outline"
                        className="h-8 whitespace-nowrap border-white/10 bg-soft-gray-10 px-3.5 text-xs font-medium text-zinc-300 hover:bg-soft-gray-15 hover:text-white"
                    >
                        {s}
                    </PromptSuggestion>
                </motion.div>
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
            {/* flex-col is REQUIRED. prompt-kit's ChatContainerRoot is
                `cn("flex overflow-y-auto", className)` — no direction, so it
                defaults to a flex ROW. In a row, the content child never gets
                a width and every message computed w=0; text then wrapped one
                character per line, making a single reply 22,548px tall and
                pushing it ~22,000px above the scroll viewport. Present in the
                DOM, perfect contrast, completely unreachable. */}
            <ChatContainerRoot className="relative h-full w-full flex-col">
                <ChatContainerContent className="flex w-full flex-col gap-5 px-4 py-4">
                {messages.map((m) =>
                    m.role === "assistant" ? (
                        <Message
                            key={m.id}
                            // zola's shape: no avatar, full-width column.
                            // A 380px panel has no room for a gutter, and the
                            // star already identifies the surface in the header.
                            className="w-full flex-col gap-2"
                            // Stable hook for scripts/ai/browser-smoke-chat.mjs.
                            // It lives on Message, not MessageContent: with
                            // `markdown` set, MessageContent renders prompt-kit's
                            // <Markdown>, which accepts only {children, id,
                            // className, components} and DROPS everything else —
                            // so the attribute never reached the DOM and the
                            // browser test reported "no visible text" while the
                            // reply was rendering perfectly well.
                            data-assistant-message=""
                        >
                            {pendingToolLabels(m).length > 0 && textOf(m).length === 0 ? (
                                <div className="flex w-full flex-col gap-1 py-1">
                                    {pendingToolLabels(m).map((label) => (
                                        <p key={label} className="text-xs text-zinc-500">
                                            {label}…
                                        </p>
                                    ))}
                                </div>
                            ) : isThinking(m) ? (
                                // No sweep/shimmer — the app dropped those on
                                // 2026-07-28 and they shouldn't come back. The
                                // dots plus a word are enough to say "working",
                                // which is the only thing the user needs here.
                                <div className="flex w-full items-center gap-2 py-1">
                                    <Loader variant="typing" className="text-zinc-500" />
                                    <span className="text-xs text-zinc-500">thinking…</span>
                                </div>
                            ) : null}
                            {/* Markdown is styled with explicit child
                                selectors, NOT `prose-*` modifiers: prompt-kit
                                assumes @tailwindcss/typography and this project
                                doesn't install it, so the `prose` class it puts
                                on MessageContent — and every prose-* variant —
                                silently does nothing here. */}
                            <MessageContent
                                markdown
                                className={[
                                    "w-full min-w-full bg-transparent p-0 text-sm leading-relaxed text-zinc-200",
                                    "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
                                    "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
                                    "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
                                    "[&_li]:my-1 [&_li]:pl-0.5",
                                    "[&_a]:text-bleu [&_a]:underline [&_a]:underline-offset-2",
                                    "[&_strong]:font-semibold [&_strong]:text-white",
                                    "[&_code]:rounded [&_code]:bg-soft-gray-15 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]",
                                    "[&_pre]:my-2 [&_pre]:overflow-x-auto",
                                ].join(" ")}
                            >
                                {textOf(m)}
                            </MessageContent>

                            {/* Rendered by the CLIENT, from a marker in the
                                tool result. The key itself never travelled
                                through the model, so it is not in this
                                message's parts and not in the row that
                                persisted them. */}
                            {streamKeyCards(m).map((card) => (
                                <StreamKeyCard key={card.id} rotated={card.rotated} />
                            ))}

                            {/* The model can PROPOSE a rotation; only this can
                                perform one. Hold rather than click, because the
                                action is destructive and irreversible — it kills
                                a live broadcast — and a hold cannot be produced
                                by a stray click on a moving surface. */}
                            {pendingApprovals(m).map((a) => (
                                <div
                                    key={a.approvalId}
                                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                                >
                                    <p className="mb-2.5 text-[12px] leading-snug text-zinc-300">
                                        This generates a new stream key and invalidates the current
                                        one. Anything broadcasting with the old key disconnects.
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <HoldToConfirm
                                            label="Hold to generate"
                                            holdingLabel="Keep holding…"
                                            onConfirm={() =>
                                                void addToolApprovalResponse({
                                                    id: a.approvalId,
                                                    approved: true,
                                                })
                                            }
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void addToolApprovalResponse({
                                                    id: a.approvalId,
                                                    approved: false,
                                                })
                                            }
                                            className="h-11 shrink-0 cursor-pointer rounded-full px-4 text-[13px] font-semibold text-zinc-400 transition-colors hover:text-white"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </Message>
                    ) : (
                        // zola's user message: no avatar, a right-aligned
                        // rounded-3xl bubble in a full-width column. max-w
                        // scaled to this panel rather than zola's max-w-xl.
                        <Message key={m.id} className="w-full flex-col items-end gap-0.5">
                            <MessageContent className="max-w-[85%] rounded-3xl bg-soft-gray-15 px-4 py-2.5 text-sm leading-relaxed text-white">
                                {textOf(m)}
                            </MessageContent>
                        </Message>
                    ),
                )}

                {/* Only until the first token lands — after that the reply
                    itself is the progress indicator. */}
                {status === "submitted" && (
                    <Message className="w-full items-center gap-2">
                        <Loader variant="typing" className="text-zinc-500" />
                        <span className="text-xs text-zinc-500">thinking…</span>
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
                    <ScrollButton className="pointer-events-auto border-white/10 bg-soft-gray-15 text-zinc-300 hover:bg-soft-gray-20 hover:text-white" />
                </div>
            </ChatContainerRoot>
        </div>
    );

    // Out of allowance: replace the composer entirely rather than leaving a
    // dead input to type into. Free users get the upgrade path; subscribers who
    // hit their tier ceiling get the reset time, because there's nothing for
    // them to buy.
    const exhaustedComposer = (
        <div className="shrink-0 p-3">
            <div className="flex flex-col items-center gap-2.5 px-3 py-3 text-center">
                <p className="text-sm leading-relaxed text-zinc-400">
                    {quota?.entitled
                        ? "you've used your ai allowance for this billing period."
                        : "you've used today's free ai messages."}
                </p>
                {quota?.entitled ? (
                    <p className="text-xs text-zinc-600">
                        resets {quota.resetAt ? new Date(quota.resetAt).toLocaleDateString() : "soon"}
                    </p>
                ) : (
                    <button
                        type="button"
                        onClick={() => usePremiumOverlay.getState().openOverlay("premium")}
                        className="flex h-11 cursor-pointer items-center rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                    >
                        upgrade for more
                    </button>
                )}
            </div>
        </div>
    );

    // Composition follows zola (ibelick/zola), prompt-kit's own author: the
    // textarea gets its OWN full-width row, and controls live in a second row
    // beneath it — left group, send on the right — all inside one surface.
    // The previous version put the textarea and button side by side, which
    // reads as "a box next to a button" rather than one control, and squeezed
    // the text as soon as anything else joined the row.
    //
    // zola's palette is not carried over: this keeps the flat fill, the single
    // slate hairline and no drop shadow.
    const composer = (
        <div className="shrink-0 p-3">
            {/* Above the input and OUTSIDE it, top-left. Inside the action row
                it competed with the controls for a cramped 380px; out here it's
                a quiet label over the thing it describes. Hidden when Redis is
                down rather than showing a count nothing is enforcing. */}
            {voice.error && (
                <p className="mb-1.5 pl-1 text-[11px] leading-none text-pastelred">{voice.error}</p>
            )}
            {quota && !quota.degraded && (
                <p className="mb-1.5 pl-1 text-[11px] leading-none text-zinc-600">
                    {quota.entitled
                        ? `${quota.remaining.toLocaleString()} left`
                        : `${quota.remaining} of ${quota.limit} free today`}
                </p>
            )}
            <PromptInput
                value={voice.interim ? `${input} ${voice.interim}`.trim() : input}
                // While the mic owns the input, keystrokes are ignored rather
                // than fighting it — otherwise typing mid-phrase commits the
                // interim text early and the next final duplicates it. The
                // button is a stop control throughout, so taking back control
                // is one click.
                onValueChange={(v) => { if (!voice.listening) setInput(v); }}
                onSubmit={submit}
                isLoading={busy}
                maxHeight={200}
                // p-0 pt-1: padding belongs to the rows inside, not the shell,
                // so the textarea can run the full width. `shadow-none` strips
                // prompt-kit's shadow-xs — a neutral drop shadow is the one
                // depth cue this app never uses.
                className="rounded-3xl border-white/10 bg-soft-gray-10 p-0 pt-1 shadow-none"
            >
                <PromptInputTextarea
                    placeholder="Ask anything…"
                    className="min-h-[44px] bg-transparent px-4 pt-3 text-sm leading-[1.3] text-white placeholder:text-zinc-500"
                />

                <PromptInputActions className="w-full items-center justify-between p-2 pt-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <WalletPill value={wallet} onChange={setWallet} />

                    </div>

                    {/* One button, four jobs, so the row never grows.
                        Precedence is deliberate: stop-the-stream, then
                        stop-dictating, then send, then speak. Dictation has to
                        outrank `canSend` — settled phrases land in `input` as
                        you talk, so ranking send higher would flip the control
                        to an arrow mid-sentence and leave the mic with no off
                        switch. */}
                    <button
                        type="button"
                        onClick={
                            busy
                                ? () => stop()
                                : micActive
                                  ? voice.stop
                                  : canSend
                                    ? submit
                                    : voice.start
                        }
                        aria-label={
                            busy ? "stop" : micActive ? "stop dictating" : canSend ? "send" : "speak"
                        }
                        className={cn(
                            "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all duration-300 ease-out",
                            micActive
                                ? "bg-pastelred text-white hover:bg-pastelred/90"
                                : "bg-white text-black hover:bg-white/90",
                        )}
                    >
                        {busy || micActive ? (
                            <span className="size-3 rounded-[3px] bg-current" />
                        ) : canSend ? (
                            <ArrowUpIcon className="size-4" />
                        ) : (
                            <AudioWavesIcon className="size-4" />
                        )}
                    </button>
                </PromptInputActions>
            </PromptInput>
        </div>
    );

    const body = (
        <>
            {/* Renders in both modes because it portals to the body — the
                docked panel is only 380px and clipped, so an in-flow dialog
                would be unusable there. */}
            <AskHistoryDialog
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                onPick={(id) => void loadThread(id)}
                activeThreadId={threadId ?? undefined}
            />
            {header}
            {/* EMPTY: heading + composer sit together in the vertical middle,
                like zola. The thread is skipped entirely rather than rendered
                at zero height, so nothing pins the composer to the bottom.
                ACTIVE: thread takes the space and the composer returns to the
                foot, where it belongs once there's something to scroll. */}
            {messages.length === 0 && !busy ? (
                <div className="flex flex-1 flex-col justify-center">
                    <div className="px-6 pb-5 text-center">
                        <h1 className="text-xl font-semibold leading-tight tracking-tight text-white">
                            What&apos;s on your mind?
                        </h1>
                    </div>
                    {exhausted ? exhaustedComposer : composer}
                    {suggestions}
                </div>
            ) : (
                <>
                    {thread}
                    {exhausted ? exhaustedComposer : composer}
                </>
            )}
        </>
    );

    if (expanded) {
        // Modelled on the Clips overlay (components/home/clips-overlay.tsx):
        // instant, edge to edge, no scrim, no backdrop-blur, no floating
        // rounded card — only the content inside animates in.
        //
        // bg-canvas, matching Clips and the sidebar, so going fullscreen reads
        // as the APP expanding rather than a modal on top of it. The docked
        // panel keeps #111 on purpose: it's a card floating over the page and
        // needs to sit slightly above the canvas behind it, which is the
        // opposite thing from a full-bleed surface that IS the page.
        //
        // z-40 and `md:pt-[var(--header-height)]` are both from Clips too: the
        // fill runs behind the header band while the content clears it, which
        // keeps the header live instead of sealing the app off. That's also why
        // there's no backdrop click-to-close — there is no backdrop. Escape
        // unwinds (overlay → docked → closed) and the morphed X shrinks.
        //
        // Portalled anyway, unlike Clips: this is triggered from inside the
        // dock's sticky column, and a `fixed` element there would be trapped in
        // that stacking context.
        //
        // No `mounted` guard before touching `document`: this whole module is
        // loaded with `ssr: false`, so it only ever renders on the client.
        return createPortal(
            <div
                // 100svh, not inset-0: `inset-0` resolves to the LARGE viewport
                // on mobile, so the composer sits under the browser's collapsing
                // chrome. svh is the small-viewport unit, which is the one that
                // keeps the input reachable while the address bar is showing.
                className="fixed inset-x-0 top-0 z-40 h-[100svh] bg-canvas"
                role="dialog"
                aria-modal="true"
                aria-label="ask chat"
            >
                <motion.div
                    initial={reduced ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    // Full-bleed black, readable column. A chat line running the
                    // width of an ultra-wide display is unreadable, so the FILL
                    // is edge to edge and the content is capped and centred.
                    className="mx-auto flex h-full w-full max-w-[760px] flex-col"
                >
                    {body}
                </motion.div>
            </div>,
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
            aria-label="ask chat"
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
