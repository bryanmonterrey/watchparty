"use client";

import { useEffect, useRef, useState } from "react";
import { Send2Icon } from "@/components/icons";
import { useStreamChat } from "@/hooks/use-stream-chat";
import { MiniProfile } from "@/components/profile/mini-profile-card";
import { ChatIdentity } from "@/components/streaming/chat-identity";
import { cn } from "@/lib/utils";

// Kick-style persistent channel chat: the room belongs to the CHANNEL, not
// the stream session — it's the same DO room live stream chat uses
// (rooms.streamChat(hostUserId)), so profile hangout and live chat are one
// conversation. Ephemeral like stream chat (no history on join).

interface ChannelChatProps {
    hostUserId: string;
    hostName?: string | null;
    className?: string;
}

export function ChannelChat({ hostUserId, hostName, className }: ChannelChatProps) {
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const { messages, send, connected } = useStreamChat(hostUserId, true);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const sendMessage = () => {
        if (!input.trim()) return;
        send(input);
        setInput("");
    };

    return (
        <div className={cn("flex flex-col overflow-hidden rounded-2xl bg-[#101011] ring-1 ring-white/10", className)}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="text-base font-bold text-zinc-100">Chat</span>
                <span
                    className={cn(
                        "size-2 rounded-full transition-colors",
                        connected ? "bg-lantern" : "bg-zinc-600",
                    )}
                    title={connected ? "Connected" : "Connecting…"}
                />
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4 scrollbar-hide">
                {messages.length === 0 && (
                    <p className="pt-8 text-center text-xs font-medium text-zinc-500">
                        {connected
                            ? `Say hi to ${hostName ?? "the"} community — chat stays open even when they're offline.`
                            : "Connecting to chat…"}
                    </p>
                )}
                {messages.map((m, i) => (
                    <div key={`${m.id}-${i}`} className="flex gap-2 break-words text-[13px]">
                        <MiniProfile userId={m.userId} triggerClassName="shrink-0">
                            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-lantern/20 text-[10px] font-bold uppercase text-lantern">
                                {m.sender[0]}
                            </div>
                        </MiniProfile>
                        <div className="flex-1 pt-0.5 leading-snug">
                            <ChatIdentity userId={m.userId} />
                            <span className="mr-2 font-semibold text-zinc-400">{m.sender}</span>
                            <span className="text-zinc-100">{m.content}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="border-t border-white/10 p-3">
                <div className="flex gap-2">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                        placeholder={connected ? "Chat…" : "Connecting…"}
                        disabled={!connected}
                        className="min-w-0 flex-1 rounded-full border border-transparent bg-zinc-800/80 px-3.5 py-2.5 text-sm font-medium text-zinc-200 transition-colors placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none focus:ring-0 disabled:opacity-50"
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!input.trim() || !connected}
                        className="shrink-0 rounded-full bg-zinc-800 p-2.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-40"
                    >
                        <Send2Icon className="size-[18px]" />
                    </button>
                </div>
            </div>
        </div>
    );
}
