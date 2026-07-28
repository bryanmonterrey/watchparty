"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send2Icon } from "../icons";
import { useStreamChat } from "@/hooks/use-stream-chat";
import { MiniProfile } from "@/components/profile/mini-profile-card";
import { ChatIdentity } from "./chat-identity";
import { TokenInlineChip } from "@/components/tokens/token-inline-chip";
import { RailTabs, RAIL_TABS } from "@/components/rails/rail-tabs";
import { RailVideoList } from "@/components/rails/rail-video-list";
import { RailRowSkeleton } from "@/components/rails/rail-row";
import { trpc } from "@/lib/trpc/client";

// The live page's right rail — home's rail, with one exception: Chat is the
// first tab, and it's what the page opens on.
//
// The bordered zinc-950 card and the "Chat" header row are gone with that
// change: the homepage rail is bare on the canvas, a tab row over a list, and
// "Chat" is a tab now rather than a heading. Everything the chat DOES —
// realtime messages, the host's pinned token, the composer — is untouched.

interface StreamChatProps {
    hostUserId: string;
    isLive: boolean;
    /** @deprecated IVS chat ARN — unused now that chat runs on the realtime DO. */
    chatRoomArn?: string | null;
    isLoading?: boolean;
}

const CHAT_TAB = "Chat";
const TABS = [CHAT_TAB, ...RAIL_TABS];

// Home's rail shell, same as the video page's: the <aside> holds the width,
// the inner div pins to the scroller's top and clears the fixed header with its
// own padding, pr-2 against the window edge. 340px is the app's one right-rail
// width. Content scrolls inside the sticky column, never growing the page.
const RAIL_ASIDE = "hidden w-[340px] shrink-0 lg:block";
const RAIL_INNER = "sticky top-0 flex h-screen flex-col gap-4 pr-2 md:pt-[calc(var(--header-height)+4px)]";

export function StreamChat({ hostUserId, isLive, isLoading }: StreamChatProps) {
    const [tab, setTab] = useState(CHAT_TAB);
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
            <aside className={RAIL_ASIDE}>
                <div className={RAIL_INNER}>
                    <RailTabs tabs={TABS} active={tab} onChange={setTab} />
                    <div className="flex min-h-0 flex-1 flex-col">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <RailRowSkeleton key={i} index={i} count={6} />
                        ))}
                    </div>
                </div>
            </aside>
        );
    }

    return (
        <aside className={RAIL_ASIDE}>
            <div className={RAIL_INNER}>
            <RailTabs tabs={TABS} active={tab} onChange={setTab} />

            {tab !== CHAT_TAB ? (
                <div className="hidden-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
                    <RailVideoList tab={tab} />
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                    {hostToken && (
                        <div className="flex items-center gap-2 px-1">
                            <TokenInlineChip token={hostToken} className="min-w-0 flex-1" />
                            <Link
                                href={`/${hostToken.id}`}
                                className="flex h-9 shrink-0 items-center rounded-full bg-lantern px-4 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95"
                            >
                                Buy
                            </Link>
                        </div>
                    )}

                    <div ref={chatContainerRef} className="scrollbar-hide min-h-0 flex-1 space-y-2.5 overflow-y-auto px-1">
                        {messages.length === 0 && (
                            <p className="pt-8 text-center text-xs font-medium text-zinc-500">
                                {isLive
                                    ? connected
                                        ? "Welcome to live chat!"
                                        : "Connecting to chat…"
                                    : "Chat is disabled for offline streams."}
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

                    <div className="flex gap-2 px-1 pb-1">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                            placeholder={isLive ? (connected ? "Chat..." : "Connecting…") : "Offline"}
                            disabled={!connected || !isLive}
                            className="flex-1 rounded-full border border-transparent bg-zinc-800/80 px-3.5 py-2.5 text-sm font-medium text-zinc-200 transition-colors placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none focus:ring-0 disabled:opacity-50"
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || !connected || !isLive}
                            className="shrink-0 rounded-full bg-zinc-800 p-2.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-40"
                        >
                            <Send2Icon className="h-[18px] w-[18px]" />
                        </button>
                    </div>
                </div>
            )}
            </div>
        </aside>
    );
}
