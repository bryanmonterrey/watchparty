"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Squircle } from "@/components/ui/squircle";
import { ArrowUpIcon, AudioWavesIcon } from "@/components/icons";
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
// Pure part-reading logic lives in its own module so it can be unit-tested
// without a browser — see tests/assistant-message-parts.test.ts.
import { textOf, isThinking, pendingToolLabels } from "@/components/ai/message-parts";

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
// COLOURS ARE FIXED, NOT THEMED. This panel paints its own dark surface
// (bg-[#111] docked, bg-canvas in the overlay) on every theme, so it must not
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
    "what's running today?",
    "how do creator subs work?",
    "what is a first buy?",
    "how do i go live?",
    "explain coins to me",
];

export function AskSurface({
    expanded,
    onExpandedChange,
}: {
    expanded: boolean;
    onExpandedChange: (next: boolean) => void;
}) {
    const [input, setInput] = useState("");
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
                        throw new Error(detail?.error ?? "you've used your ai allowance");
                    }
                    return res;
                },
            }),
        [utils],
    );

    const { messages, sendMessage, status, stop, error, clearError } = useChat({
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
    const exhausted = !!quota && (quota.remaining <= 0 || quota.tokenCeilingHit);

    const submit = () => {
        const text = input.trim();
        if (!text || busy) return;
        setInput("");
        clearError();
        // Wallet rides per-message, not in the transport — see the
        // prepareSendMessagesRequest note above.
        void sendMessage({ text }, { body: { wallet: wallet?.name } });
    };


    // NO HEADER. It held a title, an avatar-ish star, a quota line, a rewind,
    // a resize and a close — and every one of those was either duplicated
    // elsewhere or noise. The app header already provides the X (the hamburger
    // morphs to it for full-bleed overlays), and clicking the dock star closes
    // the docked panel. What survived moved into the composer's action row,
    // which is the only chrome this surface needs.

    // Starter prompts, following zola: BELOW the composer, and only on an
    // empty thread. Above the messages they were permanent chrome competing
    // with the conversation; below the input they read as what they are — a
    // way to begin — and get out of the way the moment there is one.
    //
    // Motion is zola's: a staggered scale + blur-in at 0.02s per item. Gated on
    // reduced motion like everything else here.
    const suggestions = messages.length === 0 && (
        <div className="flex shrink-0 flex-wrap gap-2 px-3 pb-3">
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
                {messages.length === 0 && !busy && (
                    // zola's empty state: one heading, nothing else. No icon,
                    // no explanatory paragraph — the starter pills under the
                    // input already say what this can do.
                    <div className="flex flex-1 items-center justify-center px-6 py-10">
                        <h1 className="font-pixel text-xl leading-tight tracking-tight text-white">
                            what&apos;s on your mind?
                        </h1>
                    </div>
                )}

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
            <PromptInput
                value={input}
                onValueChange={setInput}
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
                    placeholder="ask anything…"
                    className="min-h-[44px] bg-transparent px-4 pt-3 text-sm leading-[1.3] text-white placeholder:text-zinc-500"
                />

                <PromptInputActions className="w-full items-center justify-between p-2 pt-1">
                    <div className="flex min-w-0 items-center gap-2">
                        {/* Resize lives here now that the header is gone. Same
                            brackets-to-X morph, just rehomed. */}
                        <button
                            type="button"
                            onClick={() => onExpandedChange(!expanded)}
                            aria-label={expanded ? "shrink to panel" : "expand to overlay"}
                            aria-pressed={expanded}
                            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-soft-gray-15 hover:text-white"
                        >
                            <ExpandMorphIcon expanded={expanded} className="size-4" />
                        </button>

                        <WalletPill value={wallet} onChange={setWallet} />

                        {/* The allowance, in the composer rather than a header
                            line of its own. Hidden when Redis is down, so a
                            count that isn't being enforced is never shown. */}
                        {quota && !quota.degraded && (
                            <span className="truncate text-[11px] leading-none text-zinc-600">
                                {quota.entitled
                                    ? `${quota.remaining.toLocaleString()} left`
                                    : `${quota.remaining} of ${quota.limit} free today`}
                            </span>
                        )}
                    </div>

                    {/* Mic when there's nothing to send, send once you type —
                        one button, two jobs, so the row never grows. Speaking
                        only makes sense on an empty input: with text present the
                        obvious action is to send it. */}
                    <button
                        type="button"
                        onClick={busy ? () => stop() : canSend ? submit : undefined}
                        disabled={!busy && !canSend}
                        aria-label={busy ? "stop" : canSend ? "send" : "speak"}
                        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-all duration-300 ease-out hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-soft-gray-15 disabled:text-zinc-500"
                    >
                        {busy ? (
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
            {thread}
            {exhausted ? exhaustedComposer : composer}
            {suggestions}
        </>
    );

    if (expanded) {
        // Modelled on the Clips overlay (components/home/clips-overlay.tsx),
        // which is this app's overlay convention: the canvas is INSTANT and
        // edge to edge — no scrim, no backdrop-blur, no floating rounded card —
        // and only the content inside it animates in. `bg-canvas` is the same
        // fill the sidebar and Clips paint, so the surface reads as the app
        // going full-screen rather than as a modal sitting on top of it.
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
                <div className="flex h-[520px] w-full flex-col overflow-hidden bg-[#111]">
                    {body}
                </div>
            </Squircle>
        </motion.div>
    );
}

export default AskSurface;
