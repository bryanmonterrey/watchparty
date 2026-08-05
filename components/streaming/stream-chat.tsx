"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useResizableRail } from "@/hooks/use-resizable-rail";
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
//
// It's the one rail that resizes, though: chat is the thing people sit in for
// hours, and how wide it wants to be depends on whether you're reading it or
// watching past it. RAIL_ASIDE still supplies the breakpoint and shrink-0; the
// inline width overrides w-96 only once a drag has happened.

/** Hit area for the drag edge. Wider than it looks so the cursor is easy to catch. */
const HANDLE = "absolute inset-y-0 -left-1 z-30 w-2 cursor-ew-resize";

export function StreamChat({ hostUserId, isLoading }: StreamChatProps) {
    const [tab, setTab] = useState(CHAT_TAB);
    const { width, dragging, handleProps } = useResizableRail();

    if (isLoading) {
        return (
            <aside className={cn(RAIL_ASIDE, "relative")} style={{ width }}>
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
        <aside className={cn(RAIL_ASIDE, "relative", dragging && "select-none")} style={{ width }}>
            {/* The grab edge draws NOTHING — the cursor is the whole affordance.
                Any rule here, even one that only appears on hover, reads as a
                divider the layout didn't ask for. Double-click resets the width. */}
            <div
                {...handleProps}
                role="separator"
                aria-orientation="vertical"
                aria-label="resize chat"
                className={HANDLE}
            />
            <div className={RAIL_INNER}>
                {/* Chat owns its own scroller (it auto-scrolls to the newest
                    message), so the card must not add a second one around it. The
                    video tabs take the default, which is home's exact behaviour:
                    one scroller holding the pinned tabs and the rows. */}
                <RailCard
                    scroll={tab !== CHAT_TAB}
                    tabs={<RailTabs tabs={TABS} active={tab} onChange={setTab} />}
                >
                    {tab !== CHAT_TAB && <RailVideoList tab={tab} />}

                    {/* HIDDEN, not unmounted, when another tab is showing.
                        ChatPanel owns the room socket, so unmounting it
                        disconnected anyone who glanced at Online or New — they
                        vanished from the member roster while still watching, and
                        came back to a chat that had reset. display:none takes it
                        out of flow at no layout cost and the socket lives on.

                        Chat itself stays open whether or not the stream is live:
                        it used to connect only while broadcasting, so an offline
                        channel's chat was a dead box, emptying the moment the
                        stream ended — exactly when people want to keep talking
                        about it. */}
                    <div className={cn("flex min-h-0 flex-1 flex-col", tab !== CHAT_TAB && "hidden")}>
                        <ChatPanel hostUserId={hostUserId} />
                    </div>
                </RailCard>
            </div>
        </aside>
    );
}
