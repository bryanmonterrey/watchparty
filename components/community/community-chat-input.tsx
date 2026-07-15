"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowTurnBackwardIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { useCommunityReply } from "@/hooks/use-community-reply";
import { ArrowUpIcon, CreateIcon } from "../icons";

type Mentionable = { username: string; name: string | null };

type Props = {
    channelId: string;
    channelName: string;
    onTyping?: () => void;
    onStopTyping?: () => void;
    /** server members for @autocomplete */
    mentionables?: Mentionable[];
};

export function CommunityChatInput({ channelId, channelName, onTyping, onStopTyping, mentionables = [] }: Props) {
    const [content, setContent] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    // @autocomplete: the token being typed after the last "@" (null = closed)
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const mentionMatches = mentionQuery !== null
        ? mentionables.filter((m) =>
            m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
            (m.name ?? "").toLowerCase().startsWith(mentionQuery.toLowerCase()),
        ).slice(0, 5)
        : [];

    const insertMention = (username: string) => {
        setContent((c) => c.replace(/@[a-zA-Z0-9_-]*$/, `@${username} `));
        setMentionQuery(null);
        inputRef.current?.focus();
    };
    const utils = trpc.useUtils();
    const lastTypingRef = useRef(0);
    const { replyTo, setReplyTo } = useCommunityReply();

    // Switching channels drops a stale reply target.
    useEffect(() => {
        setReplyTo(null);
    }, [channelId, setReplyTo]);

    const sendMessage = trpc.community.sendMessage.useMutation({
        onSuccess: () => {
            setContent("");
            setReplyTo(null);
            onStopTyping?.();
            lastTypingRef.current = 0;
            utils.community.getMessages.invalidate({ channelId });
        },
    });

    const onChange = (value: string) => {
        setContent(value);
        // open/refresh the mention popover while typing an @token at the end
        const m = value.match(/@([a-zA-Z0-9_-]*)$/);
        setMentionQuery(m ? m[1] : null);
        if (!value.trim()) {
            onStopTyping?.();
            lastTypingRef.current = 0;
            return;
        }
        // Throttle typing broadcasts to at most one every 2s.
        const now = Date.now();
        if (now - lastTypingRef.current > 2000) {
            lastTypingRef.current = now;
            onTyping?.();
        }
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;
        sendMessage.mutate({ channelId, content, replyToId: replyTo?.id });
    };

    return (
        <form onSubmit={onSubmit} className="px-4 pb-5 pt-1">
            {replyTo && (
                <div className="mx-1 mb-1.5 flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-2">
                    <HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3.5 shrink-0 scale-y-[-1] text-zinc-500" strokeWidth={2} />
                    <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-400">
                        Replying to <span className="font-bold text-zinc-200">{replyTo.userName}</span>
                        <span className="text-zinc-600"> · {replyTo.content}</span>
                    </p>
                    <button
                        type="button"
                        onClick={() => setReplyTo(null)}
                        aria-label="Cancel reply"
                        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-3" strokeWidth={2.5} />
                    </button>
                </div>
            )}
            <div className="relative flex items-center bg-zinc-800/50 rounded-2xl border border-flexwhite/10 focus-within:ring-1 focus-within:ring-white/20 transition-all">
                {mentionQuery !== null && mentionMatches.length > 0 && (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-2xl bg-[#101011] p-1.5 ring-1 ring-white/10">
                        {mentionMatches.map((m, i) => (
                            <button
                                key={m.username}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}
                                className={`flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.06] ${i === 0 ? "bg-white/[0.06]" : ""}`}
                            >
                                <span className="text-[13px] font-bold text-white">@{m.username}</span>
                                {m.name && <span className="truncate text-[12px] font-medium text-zinc-500">{m.name}</span>}
                            </button>
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    className="ml-2 h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-flexwhite/40 hover:text-flexwhite hover:bg-white/5 transition-colors"
                    title="Add a file"
                >
                    <CreateIcon className="h-5.5 w-5.5" />
                </button>

                <input
                    ref={inputRef}
                    value={content}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (mentionQuery !== null && mentionMatches.length > 0 && (e.key === "Tab" || e.key === "Enter")) {
                            e.preventDefault();
                            insertMention(mentionMatches[0].username);
                        } else if (e.key === "Escape") {
                            setMentionQuery(null);
                        }
                    }}
                    onBlur={() => onStopTyping?.()}
                    disabled={sendMessage.isPending}
                    className="flex-1 min-w-0 bg-transparent py-3.5 pr-2 text-md text-flexwhite outline-none placeholder:text-flexwhite/35"
                    placeholder={`Message #${channelName}`}
                />

                <button
                    type="submit"
                    disabled={sendMessage.isPending || !content.trim()}
                    className="mr-2 h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-royal-blue text-white transition-all hover:bg-royal-blue/80 active:scale-95 disabled:opacity-0 disabled:scale-50"
                    title="Send"
                >
                    <ArrowUpIcon className="h-5.5 w-5.5" />
                </button>
            </div>
        </form>
    );
}
