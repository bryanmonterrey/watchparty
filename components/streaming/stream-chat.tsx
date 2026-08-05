"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PauseIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { useStreamChat, type StreamChatMessage } from "@/hooks/use-stream-chat";
import { RailTabs, RAIL_TABS } from "@/components/rails/rail-tabs";
import { RailVideoList } from "@/components/rails/rail-video-list";
import { RailRowSkeleton } from "@/components/rails/rail-row";
import { RailCard, RAIL_ASIDE, RAIL_INNER } from "@/components/rails/rail-card";
import { ChatLine } from "./chat-line";
import { ChatComposer } from "./chat-composer";
import { emoteSet } from "@/lib/chat/emotes";

// The live page's right rail — home's rail, with one exception: Chat is the
// first tab, and it's what the page opens on.
//
// The bordered zinc-950 card and the "Chat" header row are gone with that
// change: the homepage rail is bare on the canvas, a tab row over a list, and
// "Chat" is a tab now rather than a heading.
//
// The host's coin chip + Buy button that used to sit above the messages are gone
// too: the coin is a row in the page header now (see stream-metadata), and the
// same pill with the same action twice on one screen is just noise.
//
// The chat's own anatomy — the line, the composer, the emotes — lives in
// chat-line.tsx and chat-composer.tsx. This file owns the tab, the scroller, and
// the one piece of behaviour that needs both: scroll pausing.

interface StreamChatProps {
    hostUserId: string;
    isLive: boolean;
    /** @deprecated IVS chat ARN — unused now that chat runs on the realtime DO. */
    chatRoomArn?: string | null;
    isLoading?: boolean;
    /** Concurrent viewers, shown in the composer's footer. */
    viewerCount?: number;
}

const CHAT_TAB = "Chat";
const TABS = [CHAT_TAB, ...RAIL_TABS];

/**
 * How close to the bottom still counts as "following along".
 *
 * Not zero: a wrapped line or a just-decoded emote changes scrollHeight by a few
 * pixels, and an exact comparison would drop out of follow mode on its own and
 * strand the reader mid-conversation.
 */
const FOLLOW_SLACK_PX = 48;

/** A creator's emote set changes about never, and every viewer asks for the same one. */
const EMOTE_STALE_MS = 5 * 60 * 1000;

// Width and shell come from RailCard now — this rail was a lookalike of home's
// (loose tabs, unboxed list, 340px) rather than the same thing. See
// components/rails/rail-card.tsx.

export function StreamChat({ hostUserId, isLive, isLoading, viewerCount }: StreamChatProps) {
    const [tab, setTab] = useState(CHAT_TAB);
    const [replyTo, setReplyTo] = useState<StreamChatMessage | null>(null);
    // Whether new messages pull the view down. Scrolling up turns this off so
    // reading back doesn't fight the stream; the pill turns it back on.
    const [following, setFollowing] = useState(true);
    const scrollerRef = useRef<HTMLDivElement>(null);

    // Chat stays open whether or not the stream is live.
    //
    // It used to connect only while broadcasting, so an offline channel's chat
    // was a dead box saying "Offline" — the room emptied the moment the stream
    // ended, exactly when people want to keep talking about it. `isLive` is
    // still a prop because the surrounding UI reads it; chat just no longer
    // gates on it.
    const { messages, send, connected } = useStreamChat(hostUserId, !isLoading);

    // The channel's own emotes, merged over the global voxel set.
    const { data: custom } = trpc.creator.getEmotes.useQuery(
        { creatorId: hostUserId },
        { enabled: !!hostUserId, staleTime: EMOTE_STALE_MS },
    );
    const emotes = useMemo(() => emoteSet(custom), [custom]);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el || !following) return;
        el.scrollTop = el.scrollHeight;
    }, [messages, following]);

    const onScroll = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) return;
        setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_SLACK_PX);
    }, []);

    const resume = useCallback(() => {
        const el = scrollerRef.current;
        setFollowing(true);
        if (el) el.scrollTop = el.scrollHeight;
    }, []);

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
                        <div className="relative flex min-h-0 flex-1 flex-col">
                            <div
                                ref={scrollerRef}
                                onScroll={onScroll}
                                className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto"
                            >
                                {messages.length === 0 && (
                                    <p className="pt-8 text-center text-xs font-medium text-zinc-500">
                                        {connected ? "Say something" : "Connecting to chat…"}
                                    </p>
                                )}
                                {messages.map((m, i) => (
                                    <ChatLine
                                        key={`${m.id}-${i}`}
                                        message={m}
                                        emotes={emotes}
                                        onReply={setReplyTo}
                                    />
                                ))}
                            </div>

                            {!following && (
                                // Floats over the last lines rather than sitting
                                // above the composer, so resuming doesn't reflow
                                // the panel under the cursor.
                                <button
                                    type="button"
                                    onClick={resume}
                                    className="absolute inset-x-0 bottom-2 mx-auto flex w-fit cursor-pointer items-center gap-1.5 rounded-full bg-soft-gray-20 px-3 py-1.5 text-xs font-bold text-flexwhite transition-colors hover:bg-soft-gray-15"
                                >
                                    <HugeiconsIcon icon={PauseIcon} className="size-3.5" strokeWidth={2.5} />
                                    Chat paused for scrolling
                                </button>
                            )}

                            <ChatComposer
                                onSend={send}
                                connected={connected}
                                viewerCount={isLive ? viewerCount : undefined}
                                emotes={emotes}
                                replyTo={replyTo}
                                onCancelReply={() => setReplyTo(null)}
                            />
                        </div>
                    )}
                </RailCard>
            </div>
        </aside>
    );
}
