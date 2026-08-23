"use client";

import * as React from "react";

import { trpc } from "@/lib/trpc/client";
import { StreamChat } from "@/components/studio/stream-chat";
import { ActivityFeed } from "@/components/studio/activity-feed";
import { ModActionsFeed } from "@/components/studio/mod-actions-feed";

// The pop-out window's contents (studio S6). One panel, full height, no shell.
//
// The panels a creator actually wants on a second monitor are the LIVE ones —
// chat, activity, mod actions. Nothing here is a copy of the cockpit's
// components; they are the same components, so a fix lands in both places at
// once and the two can never drift.

export const POPOUT_PANELS = ["chat", "activity", "moderation"] as const;
export type PopoutPanelKey = (typeof POPOUT_PANELS)[number];

export const POPOUT_TITLE: Record<PopoutPanelKey, string> = {
    chat: "Chat",
    activity: "Activity",
    moderation: "Mod actions",
};

/** Window size per panel — chat is read continuously, the feeds are glanced at. */
export const POPOUT_SIZE: Record<PopoutPanelKey, { w: number; h: number }> = {
    chat: { w: 400, h: 720 },
    activity: { w: 400, h: 520 },
    moderation: { w: 400, h: 440 },
};

export function PopoutPanel({ panel, userId }: { panel: PopoutPanelKey; userId: string }) {
    const mine = trpc.stream.getMine.useQuery(undefined, { refetchInterval: 60_000 });
    const isLive = !!mine.data?.isLive;

    // The window's own title bar is the only label a pop-out gets.
    React.useEffect(() => {
        document.title = `${POPOUT_TITLE[panel]} · watchparty studio`;
    }, [panel]);

    if (panel === "chat") {
        return (
            <div className="flex h-full flex-col [&>*]:h-full">
                <StreamChat hostUserId={userId} hasChatRoom={!!mine.data?.chatRoomArn} />
            </div>
        );
    }

    if (panel === "activity") {
        return <ActivityFeed isLive={isLive} />;
    }

    return <ModActionsFeed isLive={isLive} />;
}
