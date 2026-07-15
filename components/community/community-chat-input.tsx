"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowTurnBackwardIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { useCommunityReply } from "@/hooks/use-community-reply";
import { ArrowUpIcon, CreateIcon } from "../icons";

type Props = {
    channelId: string;
    channelName: string;
    onTyping?: () => void;
    onStopTyping?: () => void;
};

export function CommunityChatInput({ channelId, channelName, onTyping, onStopTyping }: Props) {
    const [content, setContent] = useState("");
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
                <button
                    type="button"
                    className="ml-2 h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-flexwhite/40 hover:text-flexwhite hover:bg-white/5 transition-colors"
                    title="Add a file"
                >
                    <CreateIcon className="h-5.5 w-5.5" />
                </button>

                <input
                    value={content}
                    onChange={(e) => onChange(e.target.value)}
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
