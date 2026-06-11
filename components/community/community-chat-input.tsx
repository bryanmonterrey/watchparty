"use client";

import { useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { ArrowUpIcon, CreateIcon, SendIcon } from "../icons";

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

    const sendMessage = trpc.community.sendMessage.useMutation({
        onSuccess: () => {
            setContent("");
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
        sendMessage.mutate({ channelId, content });
    };

    return (
        <form onSubmit={onSubmit} className="px-4 pb-5 pt-1">
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
