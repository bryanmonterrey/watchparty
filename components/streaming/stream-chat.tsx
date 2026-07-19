"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Send2Icon } from "../icons";
import { useStreamChat } from "@/hooks/use-stream-chat";
import { MiniProfile } from "@/components/profile/mini-profile-card";
import { ChatIdentity } from "./chat-identity";
import { TokenInlineChip } from "@/components/tokens/token-inline-chip";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

interface StreamChatProps {
    hostUserId: string;
    isLive: boolean;
    /** @deprecated IVS chat ARN — unused now that chat runs on the realtime DO. */
    chatRoomArn?: string | null;
    isLoading?: boolean;
}

export function StreamChat({ hostUserId, isLive, isLoading }: StreamChatProps) {
    const [input, setInput] = useState("");
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const { messages, send, connected } = useStreamChat(hostUserId, !!isLive && !isLoading);

    // Creator's live token, pinned above chat with quick-buy (design brief §2).
    const { data: hostToken } = trpc.trade.tokenByCreator.useQuery(
        { creatorId: hostUserId },
        { enabled: !isLoading, staleTime: 60_000 },
    );

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const sendMessage = () => {
        if (!input.trim()) return;
        send(input);
        setInput("");
    };

    if (isLoading) {
        return (
            <div className="hidden lg:flex flex-col w-[340px] shrink-0 overflow-hidden h-[calc(100vh-120px)] sticky top-20">
                {/* Header */}
                <div className="px-4 py-3">
                    <div className="shimmer-skeleton h-5 w-20 rounded-full" />
                </div>
                {/* Messages */}
                <div className="flex-1 p-4 space-y-4 overflow-hidden">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex gap-2 items-start">
                            <div className="shimmer-skeleton w-6 h-6 rounded-full shrink-0" />
                            <div className="flex-1 space-y-1.5">
                                <div className={`shimmer-skeleton h-3 rounded-full ${i % 3 === 0 ? 'w-full' : i % 3 === 1 ? 'w-4/5' : 'w-2/3'}`} />
                            </div>
                        </div>
                    ))}
                </div>
                {/* Input */}
                <div className="p-3">
                    <div className="shimmer-skeleton h-10 w-full rounded-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="w-full lg:w-[340px] shrink-0 flex flex-col border border-white/10 rounded-xl bg-zinc-950 overflow-hidden lg:h-[calc(100vh-120px)] lg:sticky lg:top-20">
            <div 
                className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/50 hover:bg-zinc-800/50 cursor-pointer transition-colors group"
                onClick={() => { /* Toggle chat settings or similar */ }}
            >
                <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-zinc-100">Chat</span>
                    <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                </div>
            </div>

            {hostToken && (
                <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-900/50 px-3 py-2.5">
                    <TokenInlineChip token={hostToken} className="min-w-0 flex-1" />
                    <Link
                        href={`/${hostToken.id}`}
                        className="flex h-9 shrink-0 items-center rounded-full bg-lantern px-4 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95"
                    >
                        Buy
                    </Link>
                </div>
            )}

            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0 scrollbar-hide">
                {messages.length === 0 && (
                    <p className="text-xs text-zinc-500 text-center pt-8 font-medium">
                        {isLive ? (connected ? "Welcome to live chat!" : "Connecting to chat…") : "Chat is disabled for offline streams."}
                    </p>
                )}
                {messages.map((m, i) => (
                    <div key={`${m.id}-${i}`} className="text-[13px] break-words flex gap-2">
                        <MiniProfile userId={m.userId} triggerClassName="shrink-0">
                            <div className="w-6 h-6 rounded-full bg-lantern/20 text-lantern shrink-0 flex items-center justify-center font-bold text-[10px] uppercase">
                                {m.sender[0]}
                            </div>
                        </MiniProfile>
                        <div className="flex-1 pt-0.5 leading-snug">
                            <ChatIdentity userId={m.userId} />
                            <span className="font-semibold text-zinc-400 mr-2">{m.sender}</span>
                            <span className="text-zinc-100">{m.content}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="border-t border-white/10 p-3 bg-zinc-900/50">
                <div className="flex gap-2">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && sendMessage()}
                        placeholder={isLive ? (connected ? "Chat..." : "Connecting…") : "Offline"}
                        disabled={!connected || !isLive}
                        className="flex-1 bg-zinc-800/80 text-sm font-medium text-zinc-200 px-3.5 py-2.5 rounded-full placeholder:text-zinc-500 border border-transparent focus:border-zinc-700 focus:outline-none focus:ring-0 disabled:opacity-50 transition-colors"
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!input.trim() || !connected || !isLive}
                        className="p-2.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors shrink-0"
                    >
                        <Send2Icon className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </div>
        </div>
    );
}
