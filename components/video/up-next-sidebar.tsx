"use client";

import { useState } from "react";
import { RailTabs, RAIL_ICON_TAB } from "@/components/rails/rail-tabs";
import { RailVideoList } from "@/components/rails/rail-video-list";

// The video page's right rail — home's rail, same tabs, same rows.
//
// It used to run its own tab set (All / From <creator> / Related / Watched) and
// its own row design (192px thumbnail, views + age line). Both are gone in
// favour of the shared rail: the three right rails in the app are meant to read
// as one component in three places.
//
// WORTH KNOWING: "From <creator>" and "Related" went with that change, and they
// were the two tabs specific to watching a video. The queries behind them
// (content.getVideosByUser, content.getRelatedVideos) are untouched and still
// exported — if they come back, they come back as tabs in RAIL_TABS so every
// rail gets them, not as a fork of this one.
interface UpNextSidebarProps {
    /** Kept out of its own up-next list. Everything else the rail needs, it
     *  fetches itself — it no longer waits on the video query. */
    postId: string;
}

export function UpNextSidebar({ postId }: UpNextSidebarProps) {
    const [tab, setTab] = useState(RAIL_ICON_TAB);

    return (
        // Home's rail shell: the <aside> holds the width, the inner div pins to
        // the scroller's top and clears the fixed header with its OWN padding
        // (the column's margin doesn't apply here). pr-2 against the window
        // edge; the list scrolls inside the sticky column rather than growing
        // the page. 340px is the app's one right-rail width.
        <aside className="hidden w-[340px] shrink-0 lg:block">
            <div className="sticky top-0 flex h-screen flex-col gap-4 pr-2 md:pt-[calc(var(--header-height)+4px)]">
                <RailTabs active={tab} onChange={setTab} />
                <div className="hidden-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
                    <RailVideoList tab={tab} excludePostId={postId} />
                </div>
            </div>
        </aside>
    );
}
