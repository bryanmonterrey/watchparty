"use client";

import { useState } from "react";
import { RailTabs, RAIL_TABS } from "@/components/rails/rail-tabs";
import { RailVideoList } from "@/components/rails/rail-video-list";
import { RailRowSkeleton } from "@/components/rails/rail-row";
import { RailCard, RAIL_ASIDE, RAIL_INNER } from "@/components/rails/rail-card";
import { ChatPanel } from "./chat-panel";

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
// Chat itself lives in chat-panel.tsx, which the pop-out window also renders.
// This file is the rail: the tabs, the card, and which one is showing.

interface StreamChatProps {
    hostUserId: string;
    /** @deprecated IVS chat ARN — unused now that chat runs on the realtime DO. */
    chatRoomArn?: string | null;
    isLoading?: boolean;
}

const CHAT_TAB = "Chat";
const TABS = [CHAT_TAB, ...RAIL_TABS];

// Width and shell come from RailCard now — this rail was a lookalike of home's
// (loose tabs, unboxed list, 340px) rather than the same thing. See
// components/rails/rail-card.tsx.

export function StreamChat({ hostUserId, isLoading }: StreamChatProps) {
    const [tab, setTab] = useState(CHAT_TAB);

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
                        // Chat stays open whether or not the stream is live. It
                        // used to connect only while broadcasting, so an offline
                        // channel's chat was a dead box — the room emptied the
                        // moment the stream ended, exactly when people want to
                        // keep talking about it.
                        <ChatPanel hostUserId={hostUserId} />
                    )}
                </RailCard>
            </div>
        </aside>
    );
}
