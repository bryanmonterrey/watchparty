"use client";

import { useEffect, useRef, useState } from "react";
import { Send2Icon } from "../icons";
import { useStreamChat } from "@/hooks/use-stream-chat";
import { MiniProfile } from "@/components/profile/mini-profile-card";
import { ChatIdentity } from "./chat-identity";
import { RailTabs, RAIL_ICON_TAB, HOME_TAB_ONLINE } from "@/components/rails/rail-tabs";
import { RailVideoList } from "@/components/rails/rail-video-list";
import { RailRowSkeleton } from "@/components/rails/rail-row";
import { RailCard, RAIL_ASIDE, RAIL_INNER } from "@/components/rails/rail-card";

// The live page's right rail — home's rail, with one exception: Chat is the
// first tab, and it's what the page opens on.
//
// The bordered zinc-950 card and the "Chat" header row are gone with that
// change: the homepage rail is bare on the canvas, a tab row over a list, and
// "Chat" is a tab now rather than a heading.
//
// The host's coin chip + Buy button that used to sit above the messages are gone
// too: the coin is a row in the page header now (see stream-metadata), and the
// same pill with the same action twice on one screen is just noise. Realtime
// messages and the composer are untouched.

interface StreamChatProps {
    hostUserId: string;
    isLive: boolean;
    /** @deprecated IVS chat ARN — unused now that chat runs on the realtime DO. */
    chatRoomArn?: string | null;
    isLoading?: boolean;
}

const CHAT_TAB = "Chat";
// Home's wording, not RAIL_TABS'. "Online" and "Live" are the same tab — see
// rail-tabs — and on a page that IS a live stream, a tab labelled "Live" reads
// as "this stream" rather than "other people streaming". Online says who else
// is on, which is what it lists.
const TABS = [CHAT_TAB, RAIL_ICON_TAB, HOME_TAB_ONLINE, "New", "Upcoming"];

// Width and shell come from RailCard now — this rail was a lookalike of home's
// (loose tabs, unboxed list, 340px) rather than the same thing. See
// components/rails/rail-card.tsx.

export function StreamChat({ hostUserId, isLive, isLoading }: StreamChatProps) {
    const [tab, setTab] = useState(CHAT_TAB);
    const [input, setInput] = useState("");
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Chat stays open whether or not the stream is live.
    //
    // It used to connect only while broadcasting, so an offline channel's chat
    // was a dead box saying "Offline" — the room emptied the moment the stream
    // ended, exactly when people want to keep talking about it. `isLive` is
    // still a prop because the surrounding UI reads it; chat just no longer
    // gates on it.
    const { messages, send, connected } = useStreamChat(hostUserId, !isLoading);

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
                    <RailCard tabs={<RailTabs tabs={TABS} active={tab} onChange={setTab} />}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <RailRowSkeleton key={i} index={i} count={6} />
                        ))}
                    </RailCard>
                </div>
            </aside>
        );
    }

    return (
        <aside className={RAIL_ASIDE}>
            <div className={RAIL_INNER}>
            {/* Chat owns its own scroller (it auto-scrolls to the newest
                message), so the card must not add a second one around it. The
                video tabs take the default, which is home's exact behaviour:
                one scroller holding the pinned tabs and the rows. */}
            <RailCard
                scroll={tab !== CHAT_TAB}
                tabs={<RailTabs tabs={TABS} active={tab} onChange={setTab} />}
            >

            {tab !== CHAT_TAB ? (
                <RailVideoList tab={tab} />
            ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                    <div ref={chatContainerRef} className="scrollbar-hide min-h-0 flex-1 space-y-2.5 overflow-y-auto px-1">
                        {messages.length === 0 && (
                            <p className="pt-8 text-center text-xs font-medium text-zinc-500">
                                {connected ? "Say something" : "Connecting to chat…"}
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
                            placeholder={connected ? "Chat..." : "Connecting…"}
                            disabled={!connected}
                            className="flex-1 rounded-full border border-transparent bg-zinc-800/80 px-3.5 py-2.5 text-sm font-medium text-zinc-200 transition-colors placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none focus:ring-0 disabled:opacity-50"
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || !connected}
                            className="shrink-0 rounded-full bg-zinc-800 p-2.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-40"
                        >
                            <Send2Icon className="h-[18px] w-[18px]" />
                        </button>
                    </div>
                </div>
            )}
            </RailCard>
            </div>
        </aside>
    );
}
