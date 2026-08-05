"use client";

import { useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, SmileIcon, UserMultiple02Icon, ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { EMOTES, searchEmotes, type Emote } from "@/lib/chat/emotes";
import { CHAT_MAX_LEN } from "@/lib/realtime/protocol";
import type { StreamChatMessage } from "@/hooks/use-stream-chat";
import { compactCount } from "@/lib/utils";

// Everything below the message list: the reply banner, the quick emote strip,
// the input, and the footer bar.
//
// Anatomy from the reference. What was cut, and why: the shield (chat rules),
// the points counter, and the settings gear all sit on systems that don't exist
// here — a rules doc, a channel currency, and stored chat prefs — and a control
// that opens nothing is worse than an absent one. The viewer count is real
// (stream.listLive already returns it) so it stays.
//
// Colour: chrome is neutral and goes white when active, so the one green thing
// on the panel isn't a send button — the send pill is white, which on this
// canvas is the loudest an affordance gets.

/** How many of the set the strip shows without opening the picker. */
const QUICK_COUNT = 10;

export function ChatComposer({
    onSend,
    connected,
    viewerCount,
    emotes,
    replyTo,
    onCancelReply,
}: {
    onSend: (text: string, replyTo?: string) => void;
    connected: boolean;
    viewerCount?: number;
    emotes: Map<string, Emote>;
    replyTo?: StreamChatMessage | null;
    onCancelReply?: () => void;
}) {
    const [input, setInput] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const quick = useMemo(() => EMOTES.slice(0, QUICK_COUNT), []);
    const results = useMemo(() => searchEmotes(query, emotes), [query, emotes]);

    /** Appends a code at the caret, keeping one space around it. */
    const insert = (code: string) => {
        setInput((prev) => (prev && !prev.endsWith(" ") ? `${prev} :${code}: ` : `${prev}:${code}: `));
        inputRef.current?.focus();
    };

    const submit = () => {
        const text = input.trim();
        if (!text || !connected) return;
        onSend(text, replyTo?.id);
        setInput("");
        onCancelReply?.();
    };

    return (
        <div className="flex flex-col gap-2 pb-1 pt-1.5">
            {replyTo && (
                <div className="flex items-center gap-1.5 rounded-lg bg-soft-gray-10 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400">
                    <HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3 shrink-0" strokeWidth={2} />
                    <span className="min-w-0 flex-1 truncate">
                        Replying to <span className="text-flexwhite">{replyTo.sender}</span>
                    </span>
                    <button
                        type="button"
                        onClick={onCancelReply}
                        aria-label="cancel reply"
                        className="cursor-pointer text-zinc-500 transition-colors hover:text-white"
                    >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" strokeWidth={2} />
                    </button>
                </div>
            )}

            {/* The quick strip. Scrolls rather than wraps: a second row would
                eat message space every time the set grows. */}
            <div className="hidden-scrollbar flex shrink-0 gap-1 overflow-x-auto">
                {quick.map((e) => (
                    <button
                        key={e.code}
                        type="button"
                        onClick={() => insert(e.code)}
                        title={`:${e.code}:`}
                        aria-label={`:${e.code}:`}
                        className="shrink-0 cursor-pointer rounded-md p-1 transition-colors hover:bg-white/10 active:scale-95"
                    >
                        <img src={e.src} alt="" draggable={false} className="size-6" />
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-1.5 rounded-2xl border border-[rgba(138,145,158,0.2)] bg-soft-gray-5 px-3 py-2 transition-colors focus-within:border-[rgba(138,145,158,0.45)]">
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, CHAT_MAX_LEN))}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") submit();
                        if (e.key === "Escape") onCancelReply?.();
                    }}
                    placeholder={connected ? "Send a message" : "Connecting…"}
                    disabled={!connected}
                    className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-zinc-100 outline-none placeholder:text-zinc-500 disabled:opacity-50"
                />

                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            aria-label="emotes"
                            className="shrink-0 cursor-pointer text-zinc-500 transition-colors hover:text-white data-[state=open]:text-white"
                        >
                            <HugeiconsIcon icon={SmileIcon} className="size-[18px]" strokeWidth={2} />
                        </button>
                    </PopoverTrigger>
                    {/* side=top: the composer sits at the bottom of the rail, so
                        anything opening downward would land off-screen. */}
                    <PopoverContent side="top" align="end" className="w-72 p-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search emotes"
                            className="mb-2 w-full rounded-lg bg-soft-gray-10 px-2.5 py-1.5 text-[13px] font-medium text-zinc-100 outline-none placeholder:text-zinc-500"
                        />
                        <div className="hidden-scrollbar grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
                            {results.map((e) => (
                                <button
                                    key={e.code}
                                    type="button"
                                    onClick={() => {
                                        insert(e.code);
                                        setPickerOpen(false);
                                    }}
                                    title={`:${e.code}:`}
                                    className="cursor-pointer rounded-md p-1 transition-colors hover:bg-white/10 active:scale-95"
                                >
                                    <img src={e.src} alt={`:${e.code}:`} draggable={false} className="size-8" />
                                </button>
                            ))}
                        </div>
                        {results.length === 0 && (
                            <p className="py-6 text-center text-xs font-medium text-zinc-500">No emotes</p>
                        )}
                    </PopoverContent>
                </Popover>
            </div>

            <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                    <HugeiconsIcon icon={UserMultiple02Icon} className="size-4" strokeWidth={2} />
                    {viewerCount !== undefined ? compactCount(viewerCount) : "—"}
                </span>
                <Button
                    size="sm"
                    onClick={submit}
                    disabled={!input.trim() || !connected}
                    className="bg-white font-bold text-black hover:bg-white/85"
                >
                    Chat
                </Button>
            </div>
        </div>
    );
}
